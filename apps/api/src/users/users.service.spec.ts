import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/auth.dto.js';
import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../prisma.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

const actor = (...roles: Role[]): AuthContext => ({
  sessionId: 's1',
  user: { id: 'admin-1', username: 'admin', fullName: 'Admin', roles, mustChangePassword: false },
});

function setup({ duplicate = false } = {}) {
  const created: unknown[] = [];
  const audit: unknown[] = [];
  const createdAt = new Date('2026-11-06T08:00:00Z');
  const prisma = {
    user: {
      create: vi.fn(async ({ data }: { data: { username: string; fullName: string; passwordHash: string; roles: { create: { role: Role }[] } } }) => {
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        created.push(data);
        return {
          id: randomUUID(),
          username: data.username,
          fullName: data.fullName,
          passwordHash: data.passwordHash,
          email: null,
          phone: null,
          status: 'ACTIVE',
          mustChangePassword: true,
          createdAt,
          updatedAt: createdAt,
          roles: data.roles.create,
        };
      }),
      findMany: vi.fn(async () => [
        {
          id: 'u1',
          username: 'gv.lan',
          fullName: 'Nguyễn Thị Lan',
          passwordHash: 'scrypt$secret',
          email: 'lan@example.com',
          phone: '0900000000',
          status: 'ACTIVE',
          mustChangePassword: false,
          createdAt,
          updatedAt: createdAt,
          roles: [{ role: 'TEACHER' }],
        },
      ]),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const auth = { createTemporaryPassword: vi.fn(async () => ({ password: 'Temp2345abcd', passwordHash: 'scrypt$hash' })) };
  const service = new UsersService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  return { service, prisma, created, audit, createdAt };
}

describe('UsersService', () => {
  it('lists users without password hashes or contact details', async () => {
    const { service, createdAt } = setup();
    await expect(service.list()).resolves.toEqual([
      {
        id: 'u1',
        username: 'gv.lan',
        fullName: 'Nguyễn Thị Lan',
        roles: ['TEACHER'],
        status: 'ACTIVE',
        mustChangePassword: false,
        createdAt: createdAt.toISOString(),
      },
    ]);
  });

  it('creates a user with a one-time temporary password and records it', async () => {
    const { service, created, audit } = setup();
    const result = await service.create(actor('CENTER_ADMIN'), { username: 'hs.an', fullName: 'Trần An', roles: ['STUDENT'] });

    expect(result.temporaryPassword).toBe('Temp2345abcd');
    expect(result.user).toMatchObject({ username: 'hs.an', fullName: 'Trần An', roles: ['STUDENT'], mustChangePassword: true });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(created).toEqual([
      { username: 'hs.an', fullName: 'Trần An', passwordHash: 'scrypt$hash', mustChangePassword: true, roles: { create: [{ role: 'STUDENT' }] } },
    ]);
    expect(audit).toEqual([
      { actorId: 'admin-1', action: 'user.created', entityType: 'user', entityId: result.user.id, metadata: { roles: ['STUDENT'] } },
    ]);
  });

  it('lets only a SUPER_ADMIN grant admin roles', async () => {
    const { service } = setup();
    for (const role of ['SUPER_ADMIN', 'CENTER_ADMIN'] as const) {
      await expect(service.create(actor('CENTER_ADMIN'), { username: 'x.y', fullName: 'X', roles: [role] })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
    await expect(service.create(actor('SUPER_ADMIN'), { username: 'ql.minh', fullName: 'Minh', roles: ['CENTER_ADMIN'] })).resolves.toBeDefined();
  });

  it('reports a taken username as 409', async () => {
    const { service } = setup({ duplicate: true });
    await expect(service.create(actor('SUPER_ADMIN'), { username: 'gv.lan', fullName: 'Lan', roles: ['TEACHER'] })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('UsersController.create', () => {
  it('validates and normalizes the body before calling the service', () => {
    const create = vi.fn(async () => ({}));
    const controller = new UsersController({ create } as unknown as UsersService);
    const session = actor('SUPER_ADMIN');

    for (const body of [
      undefined,
      { username: 'ab', fullName: 'A', roles: ['STUDENT'] },
      { username: 'a'.repeat(33), fullName: 'A', roles: ['STUDENT'] },
      { username: 'trần.an', fullName: 'A', roles: ['STUDENT'] },
      { username: 'hs an', fullName: 'A', roles: ['STUDENT'] },
      { username: 'hs.an', fullName: '  ', roles: ['STUDENT'] },
      { username: 'hs.an', fullName: 'A'.repeat(101), roles: ['STUDENT'] },
      { username: 'hs.an', fullName: 'A', roles: [] },
      { username: 'hs.an', fullName: 'A', roles: ['STUDENT', 'STUDENT'] },
      { username: 'hs.an', fullName: 'A', roles: ['ROOT'] },
      { username: 'hs.an', fullName: 'A', roles: 'STUDENT' },
    ]) {
      expect(() => controller.create(session, body)).toThrow(BadRequestException);
    }
    expect(create).not.toHaveBeenCalled();

    void controller.create(session, { username: '  HS.An_01-x ', fullName: '  Trần An ', roles: ['STUDENT', 'PARENT'] });
    expect(create).toHaveBeenCalledWith(session, { username: 'hs.an_01-x', fullName: 'Trần An', roles: ['STUDENT', 'PARENT'] });
  });
});
