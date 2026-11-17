import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role, UserStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

// Fake people only.
interface StoredUser {
  id: string;
  username: string;
  fullName: string;
  status: UserStatus;
  roles: Role[];
}
interface StoredProfile {
  userId: string;
  teacherCode: string;
  bio: string | null;
}

const admin: AuthContext = {
  sessionId: 's1',
  user: { id: 'admin-1', username: 'ql.mai', fullName: 'Đỗ Thị Mai', roles: ['CENTER_ADMIN'], mustChangePassword: false },
};

function setup({ profiles = [] as StoredProfile[], codeCollisions = 0 } = {}) {
  const users = new Map<string, StoredUser>(
    [
      { id: 'gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', status: 'ACTIVE' as const, roles: ['TEACHER' as const] },
      { id: 'gv-nam', username: 'gv.nam', fullName: 'Phạm Văn Nam', status: 'INACTIVE' as const, roles: ['TEACHER' as const, 'SALES' as const] },
      { id: 'hs-minh', username: 'hs.minh', fullName: 'Nguyễn Văn Minh', status: 'ACTIVE' as const, roles: ['STUDENT' as const] },
    ].map((u) => [u.id, u]),
  );
  const store = new Map(profiles.map((p) => [p.userId, { ...p }]));
  const audit: { action: string; metadata: unknown }[] = [];
  let collisionsLeft = codeCollisions;

  const withProfile = (u: StoredUser) => ({ ...u, passwordHash: 'scrypt$secret', roles: u.roles.map((role) => ({ role })), teacherProfile: store.get(u.id) ?? null });
  const prisma = {
    user: {
      findMany: vi.fn(async () => [...users.values()].filter((u) => u.roles.includes('TEACHER')).map(withProfile)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        return u ? withProfile(u) : null;
      }),
    },
    teacherProfile: {
      create: vi.fn(async ({ data }: { data: StoredProfile }) => {
        if (collisionsLeft > 0) {
          collisionsLeft -= 1;
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        store.set(data.userId, { ...data });
        return store.get(data.userId);
      }),
      update: vi.fn(async ({ where, data }: { where: { userId: string }; data: Partial<StoredProfile> }) => Object.assign(store.get(where.userId)!, data)),
    },
    $queryRaw: vi.fn(async () => {
      const numbers = [...store.values()].map((p) => /^GV(\d+)$/.exec(p.teacherCode)?.[1]).filter((n) => n !== undefined).map(Number);
      return [{ max: numbers.length ? Math.max(...numbers) : null }];
    }),
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { service: new TeachersService(prisma as unknown as PrismaService), audit };
}

describe('TeachersService', () => {
  it('lists teachers with their code, nothing else private', async () => {
    const { service } = setup({ profiles: [{ userId: 'gv-lan', teacherCode: 'GV0001', bio: 'Dạy Python' }] });
    await expect(service.list()).resolves.toEqual([
      { userId: 'gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', status: 'ACTIVE', teacherCode: 'GV0001' },
      { userId: 'gv-nam', username: 'gv.nam', fullName: 'Phạm Văn Nam', status: 'INACTIVE', teacherCode: null },
    ]);
  });

  it('gets a teacher, and 404s for anyone else', async () => {
    const { service } = setup({ profiles: [{ userId: 'gv-lan', teacherCode: 'GV0001', bio: null }] });
    await expect(service.get('gv-lan')).resolves.toEqual({
      userId: 'gv-lan',
      username: 'gv.lan',
      fullName: 'Trần Thị Lan',
      status: 'ACTIVE',
      profile: { teacherCode: 'GV0001', bio: null },
    });
    await expect(service.get('hs-minh')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates with the next GV code and audits only whether it was created', async () => {
    const { service, audit } = setup({ profiles: [{ userId: 'old', teacherCode: 'GV0009', bio: null }] });
    await expect(service.upsert(admin, 'gv-lan', { bio: 'Dạy Scratch' })).resolves.toMatchObject({ profile: { teacherCode: 'GV0010', bio: 'Dạy Scratch' } });
    await expect(service.upsert(admin, 'gv-lan', { bio: null })).resolves.toMatchObject({ profile: { teacherCode: 'GV0010', bio: null } });
    expect(audit).toEqual([
      { actorId: 'admin-1', action: 'teacher.profile_upserted', entityType: 'teacher_profile', entityId: 'gv-lan', metadata: { created: true } },
      { actorId: 'admin-1', action: 'teacher.profile_upserted', entityType: 'teacher_profile', entityId: 'gv-lan', metadata: { created: false } },
    ]);
  });

  it('retries code collisions, then gives up with 409', async () => {
    await expect(setup({ codeCollisions: 2 }).service.upsert(admin, 'gv-lan', { bio: null })).resolves.toMatchObject({ profile: { teacherCode: 'GV0001' } });
    await expect(setup({ codeCollisions: 3 }).service.upsert(admin, 'gv-lan', { bio: null })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a non-teacher (400) and an unknown user (404)', async () => {
    const { service } = setup();
    await expect(service.upsert(admin, 'hs-minh', { bio: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert(admin, 'missing', { bio: null })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TeachersController', () => {
  it('is restricted to admins (not sales)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TeachersController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN']);
  });

  it('trims the bio and turns a blank or missing one into null', () => {
    const upsert = vi.fn(async () => ({}));
    const controller = new TeachersController({ upsert } as unknown as TeachersService);
    void controller.upsert(admin, 'gv-lan', { bio: '  Dạy Python  ' });
    void controller.upsert(admin, 'gv-lan', { bio: '  ' });
    void controller.upsert(admin, 'gv-lan', undefined);
    expect(upsert.mock.calls.map((call) => (call as unknown[])[2])).toEqual([{ bio: 'Dạy Python' }, { bio: null }, { bio: null }]);
  });

  it.each([{ bio: 'a'.repeat(2001) }, { bio: 42 }])('rejects %j with 400', (body) => {
    const controller = new TeachersController({ upsert: vi.fn() } as unknown as TeachersService);
    expect(() => controller.upsert(admin, 'gv-lan', body)).toThrow(BadRequestException);
  });
});
