import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, Role, User } from '@center9/database';
import { PrismaService } from '../prisma.service.js';
import { AttemptCounter } from './attempt-counter.js';
import type { AuthContext, LoginResultDto, SessionUserDto } from './auth.dto.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A session ends after 7 idle days... */
const SESSION_IDLE_MS = 7 * DAY_MS;
/** ...or 30 days after login, whichever comes first. */
const SESSION_MAX_AGE_MS = 30 * DAY_MS;
/** Extending only when less than this is left keeps it to about one write per session per day. */
const SESSION_EXTEND_BELOW_MS = 6 * DAY_MS;

const INVALID_CREDENTIALS = 'Invalid username or password';

/** Failed logins allowed per username and IP, then per IP across all usernames, before a FAILED_LOGIN_BLOCK_MS block. */
const MAX_FAILED_LOGINS_PER_ACCOUNT = 5;
// High enough for a whole class behind one NAT address to mistype a few times.
const MAX_FAILED_LOGINS_PER_IP = 50;
const FAILED_LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_TRACKED_LOGINS = 10_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

type UserWithRoles = User & { roles: { role: Role }[] };

function toSessionUser(user: UserWithRoles): SessionUserDto {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles: user.roles.map(({ role }) => role),
    mustChangePassword: user.mustChangePassword,
  };
}

@Injectable()
export class AuthService {
  // Checked against unknown usernames, so a login takes as long whether or not the account exists.
  private readonly dummyHash = hashPassword(randomUUID());
  // Keyed by username and IP together, so nobody can lock a student out from another network.
  private readonly accountAttempts = new AttemptCounter(MAX_FAILED_LOGINS_PER_ACCOUNT, FAILED_LOGIN_BLOCK_MS, MAX_TRACKED_LOGINS);
  // Stops one address from guessing across many usernames, and from tying up scrypt.
  private readonly ipAttempts = new AttemptCounter(MAX_FAILED_LOGINS_PER_IP, FAILED_LOGIN_BLOCK_MS, MAX_TRACKED_LOGINS);

  constructor(private readonly prisma: PrismaService) {}

  async login(username: string, password: string, clientIp: string): Promise<LoginResultDto> {
    const normalizedUsername = username.trim().toLowerCase();
    const accountKey = `${normalizedUsername}\n${clientIp}`;
    if (this.accountAttempts.isBlocked(accountKey) || this.ipAttempts.isBlocked(clientIp)) {
      throw new HttpException('Too many failed logins', HttpStatus.TOO_MANY_REQUESTS);
    }
    // Counted before any await, so parallel requests cannot all slip under the limits. Taken back on success.
    this.accountAttempts.record(accountKey);
    this.ipAttempts.record(clientIp);

    const user = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      include: { roles: true },
    });
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    this.accountAttempts.clear(accountKey);
    // Only this attempt: clearing the IP count would let one known account reset the limit.
    this.ipAttempts.forgive(clientIp);
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_IDLE_MS) },
      });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id } });
    });
    return { token, user: toSessionUser(user) };
  }

  /** Returns the session's user, or null when the token is unknown, revoked, expired or the user is not active. */
  async findSessionUser(token: string): Promise<AuthContext | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { roles: true } } },
    });
    const now = Date.now();
    const hardLimit = session ? session.createdAt.getTime() + SESSION_MAX_AGE_MS : 0;
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now || hardLimit <= now || session.user.status !== 'ACTIVE') {
      return null;
    }

    const extendedUntil = Math.min(now + SESSION_IDLE_MS, hardLimit);
    if (session.expiresAt.getTime() - now < SESSION_EXTEND_BELOW_MS && extendedUntil > session.expiresAt.getTime()) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { expiresAt: new Date(extendedUntil) } });
    }
    return { sessionId: session.id, user: toSessionUser(session.user) };
  }

  async logout({ sessionId, user }: AuthContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (count > 0) {
        await tx.auditLog.create({ data: { actorId: user.id, action: 'auth.logout', entityType: 'user', entityId: user.id } });
      }
    });
  }

  /** Also ends the user's other sessions, so a leaked password stops working everywhere else. */
  async changePassword({ sessionId, user }: AuthContext, currentPassword: string, newPassword: string): Promise<void> {
    const account = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!account) {
      throw new NotFoundException();
    }
    if (!(await verifyPassword(currentPassword, account.passwordHash))) {
      throw new ForbiddenException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('newPassword must differ from the current password');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
      await tx.authSession.updateMany({
        where: { userId: user.id, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'auth.password_changed', entityType: 'user', entityId: user.id } });
    });
  }

  /** For accounts set up by an admin: the password is shown once, and the user must change it at first login. */
  async createTemporaryPassword(): Promise<{ password: string; passwordHash: string }> {
    const password = generateTemporaryPassword();
    return { password, passwordHash: await hashPassword(password) };
  }

  /** Pass the caller's transaction client so revoking commits or rolls back with the rest of the change. */
  async revokeAllSessions(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
