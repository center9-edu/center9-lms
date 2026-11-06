import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role, User, UserStatus } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma.service.js';
import type { CreateUserInput, CreateUserResultDto, ResetPasswordResultDto, UserSummaryDto } from './users.dto.js';

/** Only a SUPER_ADMIN may grant these. */
const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN'];
// ponytail: one page is enough for one center; add paging and search when accounts outgrow it.
const MAX_LISTED_USERS = 1_000;

type UserWithRoles = User & { roles: { role: Role }[] };

const isAdmin = (roles: readonly Role[]) => roles.some((role) => ADMIN_ROLES.includes(role));

/**
 * A serializable transaction lost to a concurrent one. Prisma reports a failed query as P2034, but a failed
 * COMMIT through @prisma/adapter-pg as a DriverAdapterError whose cause.kind is TransactionWriteConflict.
 */
function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  return (error as { cause?: { kind?: unknown } } | null)?.cause?.kind === 'TransactionWriteConflict';
}

function toSummary(user: UserWithRoles): UserSummaryDto {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles: user.roles.map(({ role }) => role),
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(): Promise<UserSummaryDto[]> {
    const users = await this.prisma.user.findMany({
      include: { roles: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED_USERS,
    });
    return users.map(toSummary);
  }

  async create(actor: AuthContext, input: CreateUserInput): Promise<CreateUserResultDto> {
    if (isAdmin(input.roles) && !actor.user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only a SUPER_ADMIN can grant admin roles');
    }

    const { password, passwordHash } = await this.auth.createTemporaryPassword();
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: input.username,
            fullName: input.fullName,
            passwordHash,
            mustChangePassword: true,
            roles: { create: input.roles.map((role) => ({ role })) },
          },
          include: { roles: true },
        });
        await tx.auditLog.create({
          data: { actorId: actor.user.id, action: 'user.created', entityType: 'user', entityId: created.id, metadata: { roles: input.roles } },
        });
        return created;
      });
      return { user: toSummary(user), temporaryPassword: password };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username is already taken');
      }
      throw error;
    }
  }

  async resetPassword(actor: AuthContext, userId: string): Promise<ResetPasswordResultDto> {
    // Hashing is slow; keep it out of the transaction.
    const { password, passwordHash } = await this.auth.createTemporaryPassword();
    await this.changeAccount(actor, userId, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
      await this.auth.revokeAllSessions(userId, tx);
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'user.password_reset', entityType: 'user', entityId: userId } });
    });
    return { temporaryPassword: password };
  }

  async setStatus(actor: AuthContext, userId: string, status: UserStatus): Promise<UserSummaryDto> {
    return this.changeAccount(actor, userId, async (tx, target) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { status }, include: { roles: true } });
      if (status !== 'ACTIVE') {
        // The guard already rejects inactive users; revoking keeps old sessions dead after reactivation.
        await this.auth.revokeAllSessions(userId, tx);
      }
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'user.status_changed', entityType: 'user', entityId: userId, metadata: { from: target.status, to: status } },
      });
      return toSummary(updated);
    });
  }

  /** Roles are read on every request, so a change applies at once without signing the user out. */
  async setRoles(actor: AuthContext, userId: string, roles: Role[]): Promise<UserSummaryDto> {
    if (isAdmin(roles) && !actor.user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only a SUPER_ADMIN can grant admin roles');
    }
    return this.changeAccount(actor, userId, async (tx, target) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId, role })) });
      await tx.auditLog.create({
        data: {
          actorId: actor.user.id,
          action: 'user.roles_changed',
          entityType: 'user',
          entityId: userId,
          metadata: { from: target.roles.map(({ role }) => role), to: roles },
        },
      });
      const updated = await tx.user.findUnique({ where: { id: userId }, include: { roles: true } });
      return toSummary(updated!);
    });
  }

  /**
   * Runs an admin change to someone else's account. Serializable, so two admins demoting each other at
   * the same time cannot both succeed; afterwards at least one active SUPER_ADMIN must remain.
   */
  private async changeAccount<T>(
    actor: AuthContext,
    userId: string,
    change: (tx: Prisma.TransactionClient, target: UserWithRoles) => Promise<T>,
  ): Promise<T> {
    if (userId === actor.user.id) {
      throw new ForbiddenException('Admins cannot change their own account here');
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({ where: { id: userId }, include: { roles: true } });
          if (!target) {
            throw new NotFoundException();
          }
          if (isAdmin(target.roles.map(({ role }) => role)) && !actor.user.roles.includes('SUPER_ADMIN')) {
            throw new ForbiddenException('Only a SUPER_ADMIN can change an admin account');
          }
          const result = await change(tx, target);
          const activeSuperAdmins = await tx.user.count({ where: { status: 'ACTIVE', roles: { some: { role: 'SUPER_ADMIN' } } } });
          if (activeSuperAdmins === 0) {
            throw new ConflictException('At least one active SUPER_ADMIN must remain');
          }
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isWriteConflict(error)) {
        throw new ConflictException('Another change to accounts happened at the same time; please retry');
      }
      throw error;
    }
  }
}
