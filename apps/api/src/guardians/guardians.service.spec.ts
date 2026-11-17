import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import type { StudentsService } from '../students/students.service.js';
import { GuardiansController } from './guardians.controller.js';
import { GuardiansService } from './guardians.service.js';

// Fake people only: real users are children and their parents, never copy their data here.
interface StoredGuardian {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
}
interface StoredLink {
  studentId: string;
  guardianId: string;
  relationship: string;
  isPrimaryContact: boolean;
}

const sales: AuthContext = {
  sessionId: 's1',
  user: { id: 'sales-1', username: 'nv.ha', fullName: 'Lê Thu Hà', roles: ['SALES'], mustChangePassword: false },
};

const ACCOUNTS: { id: string; username: string; fullName: string; roles: Role[] }[] = [
  { id: 'u-ph-hung', username: 'ph.hung', fullName: 'Nguyễn Văn Hùng', roles: ['PARENT'] },
  { id: 'u-ph-lan', username: 'ph.lan', fullName: 'Trần Thị Lan', roles: ['PARENT'] },
  { id: 'u-gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', roles: ['TEACHER'] },
];
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

function setup({ guardians = [] as StoredGuardian[], links = [] as StoredLink[], studentProfiles = ['hs-minh'] } = {}) {
  const store = new Map(guardians.map((g) => [g.id, { ...g }]));
  const linkStore = links.map((l) => ({ ...l }));
  const audit: { action: string; entityType: string; entityId: string; metadata?: unknown }[] = [];
  let nextId = 1;
  const view = (g: StoredGuardian) => ({ ...g, user: ACCOUNTS.find((a) => a.id === g.userId) ?? null });
  const claimAccount = (userId: string | null, self?: string) => {
    if (userId && [...store.values()].some((g) => g.userId === userId && g.id !== self)) {
      throw unique();
    }
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { username: string } }) => {
        const account = ACCOUNTS.find((a) => a.username === where.username);
        return account ? { ...account, roles: account.roles.map((role) => ({ role })) } : null;
      }),
    },
    guardian: {
      findMany: vi.fn(async () => [...store.values()].map(view)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (store.has(where.id) ? view(store.get(where.id)!) : null)),
      create: vi.fn(async ({ data }: { data: Omit<StoredGuardian, 'id'> }) => {
        claimAccount(data.userId);
        const guardian = { id: `g${nextId++}`, ...data };
        store.set(guardian.id, guardian);
        return view(guardian);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Omit<StoredGuardian, 'id'> }) => {
        claimAccount(data.userId, where.id);
        return view(Object.assign(store.get(where.id)!, data));
      }),
    },
    // The row lock: returns the student's profile row if there is one.
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, studentId: string) => (studentProfiles.includes(studentId) ? [{ user_id: studentId }] : [])),
    studentGuardian: {
      updateMany: vi.fn(async ({ where, data }: { where: { studentId: string; guardianId: { not: string } }; data: { isPrimaryContact: boolean } }) => {
        linkStore.filter((l) => l.studentId === where.studentId && l.guardianId !== where.guardianId.not).forEach((l) => Object.assign(l, data));
      }),
      upsert: vi.fn(async ({ create, update }: { create: StoredLink; update: Partial<StoredLink> }) => {
        const existing = linkStore.find((l) => l.studentId === create.studentId && l.guardianId === create.guardianId);
        if (existing) {
          return Object.assign(existing, update);
        }
        linkStore.push({ ...create });
        return create;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { studentId: string; guardianId: string } }) => {
        const index = linkStore.findIndex((l) => l.studentId === where.studentId && l.guardianId === where.guardianId);
        if (index >= 0) {
          linkStore.splice(index, 1);
        }
        return { count: index >= 0 ? 1 : 0 };
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const students = { get: vi.fn(async (id: string) => ({ userId: id, detail: true })) };
  const service = new GuardiansService(prisma as unknown as PrismaService, students as unknown as StudentsService);
  return { service, store, linkStore, audit, students };
}

const HUNG = { id: 'g-hung', userId: null, fullName: 'Nguyễn Văn Hùng', phone: '0900000001', email: null };
const LAN = { id: 'g-lan', userId: null, fullName: 'Trần Thị Lan', phone: null, email: 'lan@example.com' };

describe('GuardiansService.create / update', () => {
  it('creates a contact-only guardian and audits without contact details', async () => {
    const { service, audit } = setup();
    await expect(service.create(sales, { fullName: 'Nguyễn Văn Hùng', phone: '0900000001', email: null, username: null })).resolves.toEqual({
      id: 'g1',
      fullName: 'Nguyễn Văn Hùng',
      phone: '0900000001',
      email: null,
      username: null,
      accountFullName: null,
    });
    expect(audit).toEqual([{ actorId: 'sales-1', action: 'guardian.created', entityType: 'guardian', entityId: 'g1', metadata: { hasAccount: false } }]);
  });

  it('links a PARENT account by username', async () => {
    const { service, store } = setup();
    const guardian = await service.create(sales, { fullName: 'Nguyễn Văn Hùng', phone: null, email: 'h@example.com', username: 'ph.hung' });
    expect(guardian).toMatchObject({ username: 'ph.hung', accountFullName: 'Nguyễn Văn Hùng' });
    expect(store.get(guardian.id)?.userId).toBe('u-ph-hung');
  });

  it('rejects an unknown username or a non-parent account (400)', async () => {
    const { service } = setup();
    const input = { fullName: 'X', phone: '0900000001', email: null };
    await expect(service.create(sales, { ...input, username: 'nobody' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(sales, { ...input, username: 'gv.lan' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409s when the account already belongs to another guardian', async () => {
    const { service } = setup({ guardians: [{ ...HUNG, userId: 'u-ph-hung' }] });
    await expect(service.create(sales, { fullName: 'X', phone: '0900000001', email: null, username: 'ph.hung' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('replaces every field on update, and 404s for an unknown guardian', async () => {
    const { service, audit } = setup({ guardians: [{ ...HUNG, userId: 'u-ph-hung' }] });
    await expect(service.update(sales, 'g-hung', { fullName: 'Nguyễn Văn Hùng', phone: null, email: 'h@example.com', username: null })).resolves.toEqual({
      id: 'g-hung',
      fullName: 'Nguyễn Văn Hùng',
      phone: null,
      email: 'h@example.com',
      username: null,
      accountFullName: null,
    });
    expect(audit[0]).toMatchObject({ action: 'guardian.updated', entityId: 'g-hung', metadata: { hasAccount: false } });
    await expect(service.update(sales, 'missing', { fullName: 'X', phone: '0900000001', email: null, username: null })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s for an unknown guardian before checking the username', async () => {
    const { service } = setup();
    await expect(service.update(sales, 'missing', { fullName: 'X', phone: '0900000001', email: null, username: 'nobody' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists guardians', async () => {
    const { service } = setup({ guardians: [HUNG, { ...LAN, userId: 'u-ph-lan' }] });
    await expect(service.list()).resolves.toEqual([
      { id: 'g-hung', fullName: 'Nguyễn Văn Hùng', phone: '0900000001', email: null, username: null, accountFullName: null },
      { id: 'g-lan', fullName: 'Trần Thị Lan', phone: null, email: 'lan@example.com', username: 'ph.lan', accountFullName: 'Trần Thị Lan' },
    ]);
  });
});

describe('GuardiansService.link / unlink', () => {
  it('links a guardian and returns the student detail', async () => {
    const { service, linkStore, audit, students } = setup({ guardians: [HUNG] });
    await expect(service.link(sales, 'hs-minh', 'g-hung', { relationship: 'FATHER', isPrimaryContact: false })).resolves.toEqual({ userId: 'hs-minh', detail: true });
    expect(linkStore).toEqual([{ studentId: 'hs-minh', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: false }]);
    expect(audit).toEqual([
      {
        actorId: 'sales-1',
        action: 'guardian.linked',
        entityType: 'student_profile',
        entityId: 'hs-minh',
        metadata: { guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: false },
      },
    ]);
    expect(students.get).toHaveBeenCalledWith('hs-minh');
  });

  // Only the clearing step: the FOR UPDATE row lock that serializes concurrent changes is a no-op in this fake.
  it("clears the primary flag on the student's other links", async () => {
    const { service, linkStore } = setup({
      guardians: [HUNG, LAN],
      links: [
        { studentId: 'hs-minh', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: true },
        { studentId: 'hs-other', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: true },
      ],
      studentProfiles: ['hs-minh', 'hs-other'],
    });
    await service.link(sales, 'hs-minh', 'g-lan', { relationship: 'MOTHER', isPrimaryContact: true });
    expect(linkStore).toEqual([
      { studentId: 'hs-minh', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: false },
      { studentId: 'hs-other', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: true },
      { studentId: 'hs-minh', guardianId: 'g-lan', relationship: 'MOTHER', isPrimaryContact: true },
    ]);
  });

  it('updates an existing link instead of adding a second one', async () => {
    const { service, linkStore } = setup({ guardians: [HUNG], links: [{ studentId: 'hs-minh', guardianId: 'g-hung', relationship: 'OTHER', isPrimaryContact: false }] });
    await service.link(sales, 'hs-minh', 'g-hung', { relationship: 'FATHER', isPrimaryContact: true });
    expect(linkStore).toEqual([{ studentId: 'hs-minh', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: true }]);
  });

  it('404s for a student without a profile or an unknown guardian', async () => {
    const { service } = setup({ guardians: [HUNG] });
    await expect(service.link(sales, 'hs-an', 'g-hung', { relationship: 'FATHER', isPrimaryContact: false })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.link(sales, 'hs-minh', 'missing', { relationship: 'FATHER', isPrimaryContact: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unlinks, and 404s when there is no such link', async () => {
    const { service, linkStore, audit } = setup({ guardians: [HUNG], links: [{ studentId: 'hs-minh', guardianId: 'g-hung', relationship: 'FATHER', isPrimaryContact: true }] });
    await expect(service.unlink(sales, 'hs-minh', 'g-hung')).resolves.toEqual({ userId: 'hs-minh', detail: true });
    expect(linkStore).toEqual([]);
    expect(audit[0]).toMatchObject({ action: 'guardian.unlinked', entityId: 'hs-minh', metadata: { guardianId: 'g-hung' } });
    await expect(service.unlink(sales, 'hs-minh', 'g-hung')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GuardiansController', () => {
  const controller = (calls: unknown[][]) =>
    new GuardiansController({ create: vi.fn(async (...args: unknown[]) => calls.push(args)), link: vi.fn(async (...args: unknown[]) => calls.push(args)) } as unknown as GuardiansService);

  it('is open to admins and sales', () => {
    expect(Reflect.getMetadata(ROLES_KEY, GuardiansController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES']);
  });

  it('normalizes the guardian body', () => {
    const calls: unknown[][] = [];
    void controller(calls).create(sales, { fullName: '  Nguyễn Văn Hùng ', phone: ' 0900 000 001 ', email: '', username: ' PH.Hung ' });
    expect(calls[0]?.[1]).toEqual({ fullName: 'Nguyễn Văn Hùng', phone: '0900 000 001', email: null, username: 'ph.hung' });
  });

  it.each([
    { fullName: 'X' },
    { fullName: '  ', phone: '0900000001' },
    { fullName: 'X', phone: 'abc' },
    { fullName: 'X', email: 'not-an-email' },
    { fullName: 'X'.repeat(101), phone: '0900000001' },
  ])('rejects guardian %j with 400', (body) => {
    expect(() => controller([]).create(sales, body)).toThrow(BadRequestException);
  });

  it('defaults isPrimaryContact to false and only accepts known relationships', () => {
    const calls: unknown[][] = [];
    const id = '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10';
    void controller(calls).link(sales, id, id, { relationship: 'MOTHER' });
    expect(calls[0]?.[3]).toEqual({ relationship: 'MOTHER', isPrimaryContact: false });
    expect(() => controller([]).link(sales, id, id, { relationship: 'Mẹ' })).toThrow(BadRequestException);
    expect(() => controller([]).link(sales, id, id, { relationship: 'MOTHER', isPrimaryContact: 'yes' })).toThrow(BadRequestException);
  });
});
