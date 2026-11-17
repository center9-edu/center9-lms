import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role, UserStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

// Fake people only: real users are children, never copy their data here.
interface StoredUser {
  id: string;
  username: string;
  fullName: string;
  status: UserStatus;
  roles: Role[];
}
interface StoredProfile {
  userId: string;
  studentCode: string;
  dateOfBirth: Date | null;
  schoolName: string | null;
  notes: string | null;
}

const sales: AuthContext = {
  sessionId: 's1',
  user: { id: 'sales-1', username: 'nv.ha', fullName: 'Lê Thu Hà', roles: ['SALES'], mustChangePassword: false },
};

const EMPTY_INPUT = { dateOfBirth: null, schoolName: null, notes: null };
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

function setup({ profiles = [] as StoredProfile[], codeCollisions = 0 } = {}) {
  const users = new Map<string, StoredUser>(
    [
      { id: 'hs-minh', username: 'hs.minh', fullName: 'Nguyễn Văn Minh', status: 'ACTIVE' as const, roles: ['STUDENT' as const] },
      { id: 'hs-an', username: 'hs.an', fullName: 'Trần Bình An', status: 'ACTIVE' as const, roles: ['STUDENT' as const] },
      { id: 'gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', status: 'ACTIVE' as const, roles: ['TEACHER' as const] },
    ].map((u) => [u.id, u]),
  );
  const store = new Map(profiles.map((p) => [p.userId, { ...p }]));
  const audit: { action: string; entityId: string; metadata: unknown }[] = [];
  let collisionsLeft = codeCollisions;

  const withProfile = (u: StoredUser) => ({ ...u, passwordHash: 'scrypt$secret', roles: u.roles.map((role) => ({ role })), studentProfile: store.has(u.id) ? { guardians: [], ...store.get(u.id)! } : null });
  const prisma = {
    user: {
      findMany: vi.fn(async () => [...users.values()].filter((u) => u.roles.includes('STUDENT')).map(withProfile)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        return u ? withProfile(u) : null;
      }),
    },
    studentProfile: {
      create: vi.fn(async ({ data }: { data: StoredProfile }) => {
        if (collisionsLeft > 0) {
          collisionsLeft -= 1;
          throw unique();
        }
        store.set(data.userId, { ...data });
        return store.get(data.userId);
      }),
      update: vi.fn(async ({ where, data }: { where: { userId: string }; data: Partial<StoredProfile> }) => Object.assign(store.get(where.userId)!, data)),
    },
    // MAX over the numeric part of HSnnnn codes, as the real query computes it.
    $queryRaw: vi.fn(async () => {
      const numbers = [...store.values()].map((p) => /^HS(\d+)$/.exec(p.studentCode)?.[1]).filter((n) => n !== undefined).map(Number);
      return [{ max: numbers.length ? Math.max(...numbers) : null }];
    }),
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const service = new StudentsService(prisma as unknown as PrismaService);
  return { service, store, audit, prisma };
}

describe('StudentsService.list', () => {
  it('lists only students, with or without a profile, and no private fields', async () => {
    const { service } = setup({
      profiles: [{ userId: 'hs-minh', studentCode: 'HS0001', dateOfBirth: new Date('2014-03-02'), schoolName: 'THCS Cầu Giấy', notes: 'ghi chú nội bộ' }],
    });
    await expect(service.list()).resolves.toEqual([
      { userId: 'hs-minh', username: 'hs.minh', fullName: 'Nguyễn Văn Minh', status: 'ACTIVE', studentCode: 'HS0001', schoolName: 'THCS Cầu Giấy' },
      { userId: 'hs-an', username: 'hs.an', fullName: 'Trần Bình An', status: 'ACTIVE', studentCode: null, schoolName: null },
    ]);
  });
});

describe('StudentsService.get', () => {
  it('returns the profile with the date of birth as YYYY-MM-DD', async () => {
    const { service } = setup({
      profiles: [{ userId: 'hs-minh', studentCode: 'HS0001', dateOfBirth: new Date('2014-03-02'), schoolName: null, notes: 'n' }],
    });
    await expect(service.get('hs-minh')).resolves.toEqual({
      userId: 'hs-minh',
      username: 'hs.minh',
      fullName: 'Nguyễn Văn Minh',
      status: 'ACTIVE',
      profile: { studentCode: 'HS0001', dateOfBirth: '2014-03-02', schoolName: null, notes: 'n' },
      guardians: [],
    });
  });

  it('includes the linked guardians', async () => {
    const guardian = { id: 'g-hung', fullName: 'Nguyễn Văn Hùng', phone: '0900000001', email: null, user: { username: 'ph.hung', fullName: 'Nguyễn Văn Hùng' } };
    const { service } = setup({
      profiles: [{ userId: 'hs-minh', studentCode: 'HS0001', dateOfBirth: null, schoolName: null, notes: null, guardians: [{ guardian, relationship: 'FATHER', isPrimaryContact: true }] } as StoredProfile],
    });
    await expect(service.get('hs-minh')).resolves.toMatchObject({
      guardians: [
        {
          guardianId: 'g-hung',
          fullName: 'Nguyễn Văn Hùng',
          phone: '0900000001',
          email: null,
          username: 'ph.hung',
          accountFullName: 'Nguyễn Văn Hùng',
          relationship: 'FATHER',
          isPrimaryContact: true,
        },
      ],
    });
  });

  it('returns profile null for a student without one', async () => {
    const { service } = setup();
    await expect(service.get('hs-an')).resolves.toMatchObject({ userId: 'hs-an', profile: null, guardians: [] });
  });

  it.each(['gv-lan', 'missing'])('404s for %s', async (id) => {
    const { service } = setup();
    await expect(service.get(id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudentsService.upsert', () => {
  it('creates a profile with the first code and audits without personal data', async () => {
    const { service, audit } = setup();
    const result = await service.upsert(sales, 'hs-minh', { dateOfBirth: '2014-03-02', schoolName: 'THCS Cầu Giấy', notes: null });
    expect(result.profile).toEqual({ studentCode: 'HS0001', dateOfBirth: '2014-03-02', schoolName: 'THCS Cầu Giấy', notes: null });
    expect(audit).toEqual([
      { actorId: 'sales-1', action: 'student.profile_upserted', entityType: 'student_profile', entityId: 'hs-minh', metadata: { created: true } },
    ]);
  });

  // The MAX-by-number SQL lives in profile-code.ts (checked by hand on Postgres); this fake only returns its result.
  it('formats the code after the highest number, past HS9999', async () => {
    const { service } = setup({
      profiles: [
        { userId: 'old-1', studentCode: 'HS9999', dateOfBirth: null, schoolName: null, notes: null },
        { userId: 'old-2', studentCode: 'HS0002', dateOfBirth: null, schoolName: null, notes: null },
      ],
    });
    const result = await service.upsert(sales, 'hs-an', EMPTY_INPUT);
    expect(result.profile?.studentCode).toBe('HS10000');
  });

  it('updates an existing profile and keeps its code', async () => {
    const { service, audit, prisma } = setup({
      profiles: [{ userId: 'hs-minh', studentCode: 'HS0007', dateOfBirth: null, schoolName: 'Cũ', notes: 'x' }],
    });
    const result = await service.upsert(sales, 'hs-minh', { dateOfBirth: null, schoolName: 'Mới', notes: null });
    expect(result.profile).toEqual({ studentCode: 'HS0007', dateOfBirth: null, schoolName: 'Mới', notes: null });
    expect(prisma.studentProfile.create).not.toHaveBeenCalled();
    expect(audit[0]?.metadata).toEqual({ created: false });
  });

  it('retries when a concurrent request took the same code', async () => {
    const { service } = setup({ codeCollisions: 2 });
    await expect(service.upsert(sales, 'hs-minh', EMPTY_INPUT)).resolves.toMatchObject({ profile: { studentCode: 'HS0001' } });
  });

  it('gives up with 409 after repeated collisions', async () => {
    const { service } = setup({ codeCollisions: 3 });
    await expect(service.upsert(sales, 'hs-minh', EMPTY_INPUT)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a user without the STUDENT role (400) and an unknown user (404)', async () => {
    const { service } = setup();
    await expect(service.upsert(sales, 'gv-lan', EMPTY_INPUT)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert(sales, 'missing', EMPTY_INPUT)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudentsController', () => {
  it('is restricted to admins and sales', () => {
    expect(Reflect.getMetadata(ROLES_KEY, StudentsController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES']);
  });

  it('trims text, turns blanks and missing fields into null', () => {
    const upsert = vi.fn(async () => ({}));
    const controller = new StudentsController({ upsert } as unknown as StudentsService);
    void controller.upsert(sales, 'hs-minh', { schoolName: '  THCS Cầu Giấy ', notes: '   ' });
    expect(upsert).toHaveBeenCalledWith(sales, 'hs-minh', { dateOfBirth: null, schoolName: 'THCS Cầu Giấy', notes: null });
  });

  it.each([
    { dateOfBirth: '2014-02-30' },
    { dateOfBirth: '02/03/2014' },
    { dateOfBirth: 20140302 },
    { schoolName: 'a'.repeat(201) },
    { notes: 'a'.repeat(2001) },
    { notes: 42 },
  ])('rejects %j with 400', (body) => {
    const controller = new StudentsController({ upsert: vi.fn() } as unknown as StudentsService);
    expect(() => controller.upsert(sales, 'hs-minh', body)).toThrow(BadRequestException);
  });
});
