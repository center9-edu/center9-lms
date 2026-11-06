import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthSession, Role, User, UserStatus } from '@center9/database';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'mat-khau-dung';
let passwordHash: string;

type FakeUser = User & { roles: { role: Role }[] };

function makeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: randomUUID(),
    username: 'gv.lan',
    passwordHash,
    fullName: 'Nguyễn Thị Lan',
    email: 'lan@example.com',
    phone: '0900000000',
    status: 'ACTIVE' as UserStatus,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [{ role: 'TEACHER' }],
    ...overrides,
  };
}

/** In-memory stand-in for the few Prisma calls AuthService makes. */
function fakePrisma(users: FakeUser[]) {
  const sessions: AuthSession[] = [];
  const audit: unknown[] = [];
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { username: string } }) => users.find((u) => u.username === where.username) ?? null),
    },
    authSession: {
      create: vi.fn(async ({ data }: { data: Pick<AuthSession, 'userId' | 'tokenHash' | 'expiresAt'> }) => {
        const session: AuthSession = { id: randomUUID(), createdAt: new Date(), revokedAt: null, ...data };
        sessions.push(session);
        return session;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const session = sessions.find((s) => s.tokenHash === where.tokenHash);
        return session ? { ...session, user: users.find((u) => u.id === session.userId) } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<AuthSession> }) =>
        Object.assign(sessions.find((s) => s.id === where.id)!, data),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; revokedAt: null }; data: Partial<AuthSession> }) => {
        const matched = sessions.filter((s) => s.id === where.id && s.revokedAt === null);
        matched.forEach((s) => Object.assign(s, data));
        return { count: matched.length };
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { service: new AuthService(prisma as unknown as PrismaService), prisma, sessions, audit };
}

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthService.login', () => {
  it('creates a session, stores only the token hash and returns a safe user DTO', async () => {
    const user = makeUser();
    const { service, sessions, audit } = fakePrisma([user]);

    const result = await service.login('  GV.Lan ', PASSWORD);

    expect(result.user).toEqual({
      id: user.id,
      username: 'gv.lan',
      fullName: 'Nguyễn Thị Lan',
      roles: ['TEACHER'],
      mustChangePassword: false,
    });
    expect(result.token).toMatch(/^[\w-]{43}$/);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(sessions[0].tokenHash).not.toContain(result.token);
    expect(sessions[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * DAY - 60_000);
    expect(audit).toEqual([{ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id }]);
  });

  it('gives the same 401 for an unknown user and a wrong password', async () => {
    const { service, sessions } = fakePrisma([makeUser()]);
    const unknown = await service.login('nobody', PASSWORD).catch((e: unknown) => e);
    const wrong = await service.login('gv.lan', 'sai').catch((e: unknown) => e);

    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect((unknown as UnauthorizedException).getResponse()).toEqual((wrong as UnauthorizedException).getResponse());
    expect(sessions).toHaveLength(0);
  });

  it('reveals an inactive account only after the right password', async () => {
    const { service, sessions } = fakePrisma([makeUser({ status: 'LOCKED' })]);
    await expect(service.login('gv.lan', 'sai')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login('gv.lan', PASSWORD)).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions).toHaveLength(0);
  });
});

describe('AuthService.findSessionUser', () => {
  async function loggedIn(overrides: Partial<FakeUser> = {}) {
    const user = makeUser(overrides);
    const fake = fakePrisma([user]);
    const { token } = await fake.service.login('gv.lan', PASSWORD);
    return { ...fake, user, token, session: fake.sessions[0] };
  }

  it('returns the user for a valid token', async () => {
    const { service, token, user, session } = await loggedIn();
    await expect(service.findSessionUser(token)).resolves.toEqual({
      sessionId: session.id,
      user: expect.objectContaining({ id: user.id, roles: ['TEACHER'] }),
    });
  });

  it('rejects unknown, revoked and expired sessions and inactive users', async () => {
    const { service, token, session, user } = await loggedIn();
    await expect(service.findSessionUser('not-a-token')).resolves.toBeNull();

    session.revokedAt = new Date();
    await expect(service.findSessionUser(token)).resolves.toBeNull();

    session.revokedAt = null;
    session.expiresAt = new Date(Date.now() - 1);
    await expect(service.findSessionUser(token)).resolves.toBeNull();

    session.expiresAt = new Date(Date.now() + DAY);
    user.status = 'INACTIVE';
    await expect(service.findSessionUser(token)).resolves.toBeNull();
  });

  it('extends an active session by 7 days, at most once a day', async () => {
    const { service, token, session, prisma } = await loggedIn();
    const loginTime = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(loginTime + 12 * 60 * 60 * 1000);
    await service.findSessionUser(token);
    expect(prisma.authSession.update).not.toHaveBeenCalled();

    vi.setSystemTime(loginTime + 2 * DAY);
    await service.findSessionUser(token);
    expect(prisma.authSession.update).toHaveBeenCalledTimes(1);
    expect(session.expiresAt.getTime()).toBe(loginTime + 9 * DAY);
  });

  it('never keeps a session past 30 days from login', async () => {
    const { service, token, session } = await loggedIn();
    const loginTime = session.createdAt.getTime();
    vi.useFakeTimers({ toFake: ['Date'] });

    for (let day = 5; day < 30; day += 5) {
      vi.setSystemTime(loginTime + day * DAY);
      await expect(service.findSessionUser(token)).resolves.not.toBeNull();
    }
    expect(session.expiresAt.getTime()).toBe(loginTime + 30 * DAY);

    vi.setSystemTime(loginTime + 30 * DAY);
    await expect(service.findSessionUser(token)).resolves.toBeNull();
  });
});

describe('AuthService.logout', () => {
  it('revokes the session once and records it', async () => {
    const user = makeUser();
    const { service, sessions, audit } = fakePrisma([user]);
    const { token } = await service.login('gv.lan', PASSWORD);
    const context = (await service.findSessionUser(token))!;

    await service.logout(context);
    await service.logout(context);

    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    await expect(service.findSessionUser(token)).resolves.toBeNull();
    expect(audit.filter((entry) => (entry as { action: string }).action === 'auth.logout')).toHaveLength(1);
  });
});
