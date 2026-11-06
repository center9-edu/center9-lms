import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role, UserStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/auth.dto.js';
import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../prisma.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

interface StoredUser {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  roles: Role[];
}

/** In-memory users for the admin operations; ids are stable names for readable tests. */
function setup(users: Array<Partial<StoredUser> & { id: string; roles: Role[] }>, { serializationFailure }: { serializationFailure?: Error } = {}) {
  const store = new Map<string, StoredUser>(
    users.map((u) => [
      u.id,
      { username: u.id, fullName: u.id, passwordHash: 'old-hash', status: 'ACTIVE', mustChangePassword: false, createdAt: new Date(), ...u },
    ]),
  );
  const audit: unknown[] = [];
  const view = (u: StoredUser) => ({ ...u, roles: u.roles.map((role) => ({ role })) });
  const tx = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = store.get(where.id);
        return u ? view(u) : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredUser> }) => {
        const u = Object.assign(store.get(where.id)!, data);
        return view(u);
      }),
      count: vi.fn(async () => [...store.values()].filter((u) => u.status === 'ACTIVE' && u.roles.includes('SUPER_ADMIN')).length),
    },
    userRole: {
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        store.get(where.userId)!.roles = [];
      }),
      createMany: vi.fn(async ({ data }: { data: { userId: string; role: Role }[] }) => {
        data.forEach(({ userId, role }) => store.get(userId)!.roles.push(role));
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => audit.push(data)) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown, options?: { isolationLevel?: string }) => {
      expect(options?.isolationLevel).toBe('Serializable');
      if (serializationFailure) {
        throw serializationFailure;
      }
      // Roll back on error, like a real transaction.
      const snapshot = structuredClone([...store.entries()]);
      try {
        return await fn(tx);
      } catch (error) {
        store.clear();
        snapshot.forEach(([id, u]) => store.set(id, u));
        throw error;
      }
    }),
  };
  const auth = {
    createTemporaryPassword: vi.fn(async () => ({ password: 'Temp2345abcd', passwordHash: 'new-hash' })),
    revokeAllSessions: vi.fn(async () => undefined),
  };
  const service = new UsersService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  return { service, store, audit, auth };
}

const as = (id: string, ...roles: Role[]): AuthContext => ({
  sessionId: 's',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});

const SUPER = as('super', 'SUPER_ADMIN');
const CENTER = as('center', 'CENTER_ADMIN');
const people = () =>
  setup([
    { id: 'super', roles: ['SUPER_ADMIN'] },
    { id: 'super2', roles: ['SUPER_ADMIN'] },
    { id: 'center', roles: ['CENTER_ADMIN'] },
    { id: 'teacher', roles: ['TEACHER'] },
  ]);

describe('UsersService.resetPassword', () => {
  it('sets a temporary password, signs the user out everywhere and records it', async () => {
    const { service, store, audit, auth } = people();
    await expect(service.resetPassword(CENTER, 'teacher')).resolves.toEqual({ temporaryPassword: 'Temp2345abcd' });
    expect(store.get('teacher')).toMatchObject({ passwordHash: 'new-hash', mustChangePassword: true });
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('teacher', expect.anything());
    expect(audit).toEqual([{ actorId: 'center', action: 'user.password_reset', entityType: 'user', entityId: 'teacher' }]);
  });
});

describe('UsersService.setStatus', () => {
  it('locks a user and signs them out; reactivating does not need to', async () => {
    const { service, store, audit, auth } = people();
    await expect(service.setStatus(CENTER, 'teacher', 'LOCKED')).resolves.toMatchObject({ id: 'teacher', status: 'LOCKED' });
    expect(auth.revokeAllSessions).toHaveBeenCalledTimes(1);
    await service.setStatus(CENTER, 'teacher', 'ACTIVE');
    expect(auth.revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(store.get('teacher')?.status).toBe('ACTIVE');
    expect(audit).toContainEqual({
      actorId: 'center',
      action: 'user.status_changed',
      entityType: 'user',
      entityId: 'teacher',
      metadata: { from: 'ACTIVE', to: 'LOCKED' },
    });
  });

  it('never leaves the system without an active SUPER_ADMIN', async () => {
    // The acting SUPER_ADMIN was locked by someone else a moment ago.
    const { service, store } = setup([
      { id: 'super', roles: ['SUPER_ADMIN'], status: 'LOCKED' },
      { id: 'super2', roles: ['SUPER_ADMIN'] },
    ]);
    await expect(service.setStatus(SUPER, 'super2', 'LOCKED')).rejects.toBeInstanceOf(ConflictException);
    expect(store.get('super2')?.status).toBe('ACTIVE');
  });
});

describe('UsersService.setRoles', () => {
  it('replaces the roles and records the change', async () => {
    const { service, store, audit } = people();
    await expect(service.setRoles(CENTER, 'teacher', ['TEACHER', 'SALES'])).resolves.toMatchObject({ roles: ['TEACHER', 'SALES'] });
    expect(store.get('teacher')?.roles).toEqual(['TEACHER', 'SALES']);
    expect(audit).toEqual([
      {
        actorId: 'center',
        action: 'user.roles_changed',
        entityType: 'user',
        entityId: 'teacher',
        metadata: { from: ['TEACHER'], to: ['TEACHER', 'SALES'] },
      },
    ]);
  });

  it('lets only a SUPER_ADMIN grant admin roles', async () => {
    const { service } = people();
    await expect(service.setRoles(CENTER, 'teacher', ['CENTER_ADMIN'])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setRoles(SUPER, 'teacher', ['TEACHER', 'CENTER_ADMIN'])).resolves.toMatchObject({
      roles: ['TEACHER', 'CENTER_ADMIN'],
    });
  });

  it('keeps an active SUPER_ADMIN when removing the role', async () => {
    const { service } = setup([
      { id: 'super', roles: ['SUPER_ADMIN'], status: 'INACTIVE' },
      { id: 'super2', roles: ['SUPER_ADMIN'] },
    ]);
    await expect(service.setRoles(SUPER, 'super2', ['TEACHER'])).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService admin rules', () => {
  const operations = {
    resetPassword: (s: UsersService, actor: AuthContext, id: string) => s.resetPassword(actor, id),
    setStatus: (s: UsersService, actor: AuthContext, id: string) => s.setStatus(actor, id, 'LOCKED'),
    setRoles: (s: UsersService, actor: AuthContext, id: string) => s.setRoles(actor, id, ['TEACHER']),
  };

  for (const [name, run] of Object.entries(operations)) {
    it(`${name}: only a SUPER_ADMIN changes admin accounts, nobody changes their own, unknown ids are 404`, async () => {
      const { service, audit } = people();
      await expect(run(service, CENTER, 'super2')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run(service, CENTER, 'center')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run(service, SUPER, 'super')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run(service, SUPER, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
      expect(audit).toEqual([]);
      await expect(run(service, SUPER, 'center')).resolves.toBeDefined();
    });
  }

  it('asks the client to retry when a concurrent change conflicts', async () => {
    // Prisma reports a failed query as P2034, but a failed COMMIT through @prisma/adapter-pg as a
    // DriverAdapterError whose cause.kind is TransactionWriteConflict (Postgres 40001).
    const conflicts = [
      new Prisma.PrismaClientKnownRequestError('could not serialize access', { code: 'P2034', clientVersion: 'test' }),
      Object.assign(new Error('TransactionWriteConflict'), { name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } }),
    ];
    for (const serializationFailure of conflicts) {
      const { service } = setup([{ id: 'teacher', roles: ['TEACHER'] }], { serializationFailure });
      await expect(service.setStatus(SUPER, 'teacher', 'LOCKED')).rejects.toBeInstanceOf(ConflictException);
    }
    const { service } = setup([{ id: 'teacher', roles: ['TEACHER'] }], { serializationFailure: new Error('connection lost') });
    await expect(service.setStatus(SUPER, 'teacher', 'LOCKED')).rejects.not.toBeInstanceOf(ConflictException);
  });
});

describe('UsersController admin bodies', () => {
  it('validates roles and status before calling the service', () => {
    const setRoles = vi.fn(async () => ({}));
    const setStatus = vi.fn(async () => ({}));
    const controller = new UsersController({ setRoles, setStatus } as unknown as UsersService);
    for (const body of [undefined, { roles: [] }, { roles: ['ROOT'] }, { roles: ['TEACHER', 'TEACHER'] }]) {
      expect(() => controller.setRoles(SUPER, 'id', body)).toThrow(BadRequestException);
    }
    for (const body of [undefined, { status: 'DELETED' }, { status: 'active' }]) {
      expect(() => controller.setStatus(SUPER, 'id', body)).toThrow(BadRequestException);
    }
    void controller.setRoles(SUPER, 'id', { roles: ['PARENT'] });
    void controller.setStatus(SUPER, 'id', { status: 'INACTIVE' });
    expect(setRoles).toHaveBeenCalledWith(SUPER, 'id', ['PARENT']);
    expect(setStatus).toHaveBeenCalledWith(SUPER, 'id', 'INACTIVE');
  });
});
