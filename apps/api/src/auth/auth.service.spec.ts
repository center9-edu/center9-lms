import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import type { AuthSession, Role, User, UserStatus } from '@center9/database';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { hashPassword, verifyPassword } from './password.js';

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'mat-khau-dung';
let passwordHash: string;

type FakeUser = User & { roles: { role: Role }[] };

/** A valid hash with tiny scrypt parameters, for tests that need many logins. */
function cheapHash(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 });
  return `scrypt$1024$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

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
      findUnique: vi.fn(
        async ({ where }: { where: { username?: string; id?: string } }) =>
          users.find((u) => u.username === where.username || u.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<User> }) =>
        Object.assign(users.find((u) => u.id === where.id)!, data),
      ),
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
      updateMany: vi.fn(
        async ({ where, data }: { where: { id?: string | { not: string }; userId?: string; revokedAt: null }; data: Partial<AuthSession> }) => {
        const matched = sessions.filter(
          (s) =>
            s.revokedAt === null &&
            (where.userId === undefined || s.userId === where.userId) &&
            (typeof where.id === 'string' ? s.id === where.id : where.id === undefined || s.id !== where.id.not),
        );
        matched.forEach((s) => Object.assign(s, data));
        return { count: matched.length };
      },
      ),
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

    const result = await service.login('  GV.Lan ', PASSWORD, '192.0.2.1');

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
    const unknown = await service.login('nobody', PASSWORD, '192.0.2.1').catch((e: unknown) => e);
    const wrong = await service.login('gv.lan', 'sai', '192.0.2.1').catch((e: unknown) => e);

    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect((unknown as UnauthorizedException).getResponse()).toEqual((wrong as UnauthorizedException).getResponse());
    expect(sessions).toHaveLength(0);
  });

  it('reveals an inactive account only after the right password', async () => {
    const { service, sessions } = fakePrisma([makeUser({ status: 'LOCKED' })]);
    await expect(service.login('gv.lan', 'sai', '192.0.2.1')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login('gv.lan', PASSWORD, '192.0.2.1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions).toHaveLength(0);
  });
});

describe('AuthService.findSessionUser', () => {
  async function loggedIn(overrides: Partial<FakeUser> = {}) {
    const user = makeUser(overrides);
    const fake = fakePrisma([user]);
    const { token } = await fake.service.login('gv.lan', PASSWORD, '192.0.2.1');
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
    const { token } = await service.login('gv.lan', PASSWORD, '192.0.2.1');
    const context = (await service.findSessionUser(token))!;

    await service.logout(context);
    await service.logout(context);

    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    await expect(service.findSessionUser(token)).resolves.toBeNull();
    expect(audit.filter((entry) => (entry as { action: string }).action === 'auth.logout')).toHaveLength(1);
  });
});

describe('AuthService.changePassword', () => {
  const NEW_PASSWORD = 'mat-khau-moi-456';

  async function twoSessions(overrides: Partial<FakeUser> = {}) {
    const user = makeUser(overrides);
    const fake = fakePrisma([user]);
    const current = (await fake.service.findSessionUser((await fake.service.login('gv.lan', PASSWORD, '192.0.2.1')).token))!;
    const otherToken = (await fake.service.login('gv.lan', PASSWORD, '192.0.2.1')).token;
    return { ...fake, user, current, otherToken };
  }

  it('sets the new password, clears mustChangePassword and signs out other sessions only', async () => {
    const { service, user, current, otherToken, sessions, audit } = await twoSessions({ mustChangePassword: true });

    await service.changePassword(current, PASSWORD, NEW_PASSWORD);

    await expect(verifyPassword(NEW_PASSWORD, user.passwordHash)).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect(sessions.find((s) => s.id === current.sessionId)?.revokedAt).toBeNull();
    await expect(service.findSessionUser(otherToken)).resolves.toBeNull();
    expect(audit).toContainEqual({ actorId: user.id, action: 'auth.password_changed', entityType: 'user', entityId: user.id });
  });

  it('requires the current password', async () => {
    const { service, user, current } = await twoSessions();
    await expect(service.changePassword(current, 'sai', NEW_PASSWORD)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(verifyPassword(PASSWORD, user.passwordHash)).resolves.toBe(true);
  });

  it('refuses to keep the same password', async () => {
    const { service, current } = await twoSessions({ mustChangePassword: true });
    await expect(service.changePassword(current, PASSWORD, PASSWORD)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthController.changePassword', () => {
  const session = { sessionId: 's1', user: { id: 'u1', username: 'a', fullName: 'A', roles: [], mustChangePassword: true } };

  it('validates the body before calling the service', async () => {
    const changePassword = vi.fn(async () => undefined);
    const controller = new AuthController({ changePassword } as unknown as AuthService);

    for (const body of [
      undefined,
      { currentPassword: 'x' },
      { currentPassword: 'x', newPassword: 'short7!' },
      { currentPassword: 'x', newPassword: 'x'.repeat(129) },
      { currentPassword: 42, newPassword: 'long-enough' },
    ]) {
      expect(() => controller.changePassword(session, body)).toThrow(BadRequestException);
    }
    expect(changePassword).not.toHaveBeenCalled();

    await controller.changePassword(session, { currentPassword: 'x', newPassword: '8 chars!' });
    expect(changePassword).toHaveBeenCalledWith(session, 'x', '8 chars!');
  });
});

describe('AuthService.login throttling', () => {
  const IP = '203.0.113.7';
  const MINUTE = 60_000;
  const status = (error: unknown) => (error instanceof HttpException ? error.getStatus() : error);
  const attempt = (service: AuthService, password: string, username = 'gv.lan', ip = IP) =>
    service.login(username, password, ip).then(
      () => 200,
      (error: unknown) => status(error),
    );

  it('blocks a username and IP for 15 minutes after 5 failures, even with the right password', async () => {
    const { service } = fakePrisma([makeUser()]);
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();

    for (let i = 0; i < 5; i++) {
      expect(await attempt(service, 'sai')).toBe(401);
    }
    expect(await attempt(service, PASSWORD)).toBe(429);

    vi.setSystemTime(start + 14 * MINUTE);
    expect(await attempt(service, PASSWORD)).toBe(429);
    vi.setSystemTime(start + 15 * MINUTE);
    expect(await attempt(service, PASSWORD)).toBe(200);
  });

  it('counts username and IP together, case-insensitively, and unknown usernames too', async () => {
    const { service } = fakePrisma([makeUser()]);
    for (let i = 0; i < 5; i++) {
      await attempt(service, 'sai', i % 2 ? 'GV.LAN' : 'gv.lan');
      await attempt(service, 'sai', 'nobody');
    }
    expect(await attempt(service, PASSWORD)).toBe(429);
    expect(await attempt(service, 'sai', 'nobody')).toBe(429);
    expect(await attempt(service, PASSWORD, 'gv.lan', '198.51.100.1')).toBe(200);
  });

  it('resets the count after a successful login', async () => {
    const { service } = fakePrisma([makeUser()]);
    for (let i = 0; i < 4; i++) {
      await attempt(service, 'sai');
    }
    expect(await attempt(service, PASSWORD)).toBe(200);
    for (let i = 0; i < 4; i++) {
      expect(await attempt(service, 'sai')).toBe(401);
    }
    expect(await attempt(service, PASSWORD)).toBe(200);
  });

  it('counts concurrent attempts, so parallel guesses cannot skip the limit', async () => {
    const { service } = fakePrisma([makeUser()]);
    const results = await Promise.all(Array.from({ length: 12 }, () => attempt(service, 'sai')));
    expect(results.filter((code) => code === 401)).toHaveLength(5);
    expect(results.filter((code) => code === 429)).toHaveLength(7);
  });

  it('blocks an IP after 50 failures across any usernames, without resetting on success', async () => {
    const quick = Array.from({ length: 50 }, (_, i) => makeUser({ username: `hs${i}`, passwordHash: cheapHash(PASSWORD) }));
    const owner = makeUser({ passwordHash: cheapHash(PASSWORD) });
    const { service } = fakePrisma([owner, ...quick]);

    for (let i = 0; i < 49; i++) {
      expect(await attempt(service, 'sai', `hs${i}`)).toBe(401);
    }
    // A successful login takes back only its own attempt, so a known account cannot reset the IP limit.
    expect(await attempt(service, PASSWORD)).toBe(200);
    expect(await attempt(service, 'sai', 'hs49')).toBe(401);

    expect(await attempt(service, PASSWORD)).toBe(429);
    expect(await attempt(service, PASSWORD, 'hs0')).toBe(429);
    expect(await attempt(service, PASSWORD, 'gv.lan', '198.51.100.1')).toBe(200);
  });
});
