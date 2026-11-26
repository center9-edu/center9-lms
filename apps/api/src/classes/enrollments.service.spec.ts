import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ClassStatus, EnrollmentStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { ClassesController } from './classes.controller.js';
import type { ClassesService } from './classes.service.js';
import { EnrollmentsService } from './enrollments.service.js';

// Fake people only: real students are children, never copy their data here.
interface StoredEnrollment {
  id: string;
  classId: string;
  studentId: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  leftAt: Date | null;
}
interface StoredClass {
  status: ClassStatus;
  capacity: number | null;
  teacherIds: string[];
}

const actor = (id: string, roles: AuthContext['user']['roles']): AuthContext => ({
  sessionId: 's1',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});
const sales = actor('nv-ha', ['SALES']);
const lan = actor('gv-lan', ['TEACHER']);
const nam = actor('gv-nam', ['TEACHER']);

const ENROLLED_AT = new Date('2026-11-26T03:00:00Z');
const STUDENTS = new Map([
  ['hs-an', { studentCode: 'HS0001', fullName: 'Lê Bảo An', status: 'ACTIVE' }],
  ['hs-minh', { studentCode: 'HS0002', fullName: 'Nguyễn Văn Minh', status: 'ACTIVE' }],
  ['hs-binh', { studentCode: 'HS0003', fullName: 'Trần Bình', status: 'ACTIVE' }],
  ['hs-off', { studentCode: 'HS0004', fullName: 'Học Sinh Khoá', status: 'DISABLED' }],
]);

function setup({ classes = { k: { status: 'OPEN', capacity: null, teacherIds: ['gv-lan'] } } as Record<string, StoredClass>, enrollments = [] as StoredEnrollment[] } = {}) {
  const store = new Map(enrollments.map((e) => [e.id, { ...e }]));
  const audit: { action: string; entityType: string; entityId: string; metadata?: unknown }[] = [];
  const steps: string[] = [];
  let nextId = 1;
  const withStudent = (e: StoredEnrollment) => {
    const { studentCode, fullName } = STUDENTS.get(e.studentId)!;
    return { ...e, student: { studentCode, user: { fullName } } };
  };

  const prisma = {
    // The class row lock: SELECT status, capacity … FOR UPDATE.
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, classId: string) => {
      steps.push('lock');
      const found = classes[classId];
      return found ? [{ status: found.status, capacity: found.capacity }] : [];
    }),
    class: {
      // Visibility check before reading the list: a teacher only finds their own classes.
      findFirst: vi.fn(async ({ where }: { where: { id: string; teachers?: { some: { teacherId: string } } } }) => {
        const found = classes[where.id];
        return found && (!where.teachers || found.teacherIds.includes(where.teachers.some.teacherId)) ? { id: where.id } : null;
      }),
    },
    studentProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const found = STUDENTS.get(where.userId);
        return found ? { user: { status: found.status } } : null;
      }),
    },
    classEnrollment: {
      findMany: vi.fn(async ({ where }: { where: { classId: string } }) => [...store.values()].filter((e) => e.classId === where.classId).map(withStudent)),
      findUnique: vi.fn(async ({ where }: { where: { classId_studentId: { classId: string; studentId: string } } }) => {
        const { classId, studentId } = where.classId_studentId;
        return [...store.values()].find((e) => e.classId === classId && e.studentId === studentId) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; classId: string } }) => {
        const found = store.get(where.id);
        return found && found.classId === where.classId ? found : null;
      }),
      count: vi.fn(async ({ where }: { where: { classId: string; status: EnrollmentStatus } }) => {
        steps.push('count');
        return [...store.values()].filter((e) => e.classId === where.classId && e.status === where.status).length;
      }),
      create: vi.fn(async ({ data }: { data: { classId: string; studentId: string } }) => {
        const created = { ...data, id: `e${nextId++}`, status: 'ACTIVE' as const, enrolledAt: ENROLLED_AT, leftAt: null };
        store.set(created.id, created);
        return withStudent(created);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredEnrollment> }) => withStudent(Object.assign(store.get(where.id)!, data))),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { service: new EnrollmentsService(prisma as unknown as PrismaService), store, audit, steps };
}

const enrollment = (overrides: Partial<StoredEnrollment> & { id: string; studentId: string }): StoredEnrollment => ({
  classId: 'k',
  status: 'ACTIVE',
  enrolledAt: ENROLLED_AT,
  leftAt: null,
  ...overrides,
});

describe('EnrollmentsService.enroll', () => {
  it('enrolls a student, counting seats only after locking the class, and audits it without personal data', async () => {
    const { service, audit, steps } = setup({ classes: { k: { status: 'OPEN', capacity: 2, teacherIds: [] } } });
    await expect(service.enroll(sales, 'k', 'hs-an')).resolves.toEqual({
      id: 'e1',
      studentId: 'hs-an',
      studentCode: 'HS0001',
      fullName: 'Lê Bảo An',
      status: 'ACTIVE',
      enrolledAt: ENROLLED_AT.toISOString(),
      leftAt: null,
      nextStatuses: ['COMPLETED', 'DROPPED', 'REMOVED'],
    });
    expect(steps).toEqual(['lock', 'count']);
    expect(audit).toEqual([{ actorId: 'nv-ha', action: 'enrollment.created', entityType: 'enrollment', entityId: 'e1', metadata: { classId: 'k' } }]);
  });

  it('409s when the class is full; only active students take a seat', async () => {
    const { service } = setup({
      classes: { k: { status: 'IN_PROGRESS', capacity: 2, teacherIds: [] } },
      enrollments: [enrollment({ id: 'a', studentId: 'hs-an' }), enrollment({ id: 'b', studentId: 'hs-minh', status: 'DROPPED', leftAt: ENROLLED_AT })],
    });
    await expect(service.enroll(sales, 'k', 'hs-binh')).resolves.toMatchObject({ status: 'ACTIVE' });
    const full = setup({ classes: { k: { status: 'OPEN', capacity: 1, teacherIds: [] } }, enrollments: [enrollment({ id: 'a', studentId: 'hs-an' })] });
    await expect(full.service.enroll(sales, 'k', 'hs-binh')).rejects.toBeInstanceOf(ConflictException);
  });

  it('restores a removed student on the same row, and refuses a student who is already in, finished or dropped', async () => {
    const { service, store, audit } = setup({
      enrollments: [
        enrollment({ id: 'a', studentId: 'hs-an', status: 'REMOVED', leftAt: ENROLLED_AT }),
        enrollment({ id: 'b', studentId: 'hs-minh' }),
        enrollment({ id: 'c', studentId: 'hs-binh', status: 'DROPPED', leftAt: ENROLLED_AT }),
      ],
    });
    await expect(service.enroll(sales, 'k', 'hs-an')).resolves.toMatchObject({ id: 'a', status: 'ACTIVE', leftAt: null });
    expect(store.size).toBe(3);
    expect(audit.map(({ action }) => action)).toEqual(['enrollment.restored']);
    await expect(service.enroll(sales, 'k', 'hs-minh')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.enroll(sales, 'k', 'hs-binh')).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown class or student; 409s for a closed class or a disabled student', async () => {
    const { service } = setup({ classes: { k: { status: 'OPEN', capacity: null, teacherIds: [] }, done: { status: 'COMPLETED', capacity: null, teacherIds: [] } } });
    await expect(service.enroll(sales, 'missing', 'hs-an')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.enroll(sales, 'k', 'no-profile')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.enroll(sales, 'done', 'hs-an')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.enroll(sales, 'k', 'hs-off')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('EnrollmentsService.setStatus', () => {
  it.each([
    ['ACTIVE', 'COMPLETED', false],
    ['ACTIVE', 'DROPPED', true],
    ['ACTIVE', 'REMOVED', true],
    ['REMOVED', 'ACTIVE', false],
  ] as const)('moves %s to %s (left_at set: %s) and audits it', async (from, to, left) => {
    const { service, audit } = setup({ enrollments: [enrollment({ id: 'a', studentId: 'hs-an', status: from, leftAt: from === 'REMOVED' ? ENROLLED_AT : null })] });
    const dto = await service.setStatus(sales, 'k', 'a', to);
    expect(dto.status).toBe(to);
    expect(dto.leftAt !== null).toBe(left);
    expect(audit).toEqual([{ actorId: 'nv-ha', action: 'enrollment.status_changed', entityType: 'enrollment', entityId: 'a', metadata: { classId: 'k', from, to } }]);
  });

  it.each([
    ['DROPPED', 'ACTIVE'],
    ['COMPLETED', 'ACTIVE'],
    ['COMPLETED', 'DROPPED'],
    ['REMOVED', 'COMPLETED'],
    ['ACTIVE', 'ACTIVE'],
  ] as const)('409s for %s to %s', async (from, to) => {
    const { service, store } = setup({ enrollments: [enrollment({ id: 'a', studentId: 'hs-an', status: from, leftAt: from === 'ACTIVE' || from === 'COMPLETED' ? null : ENROLLED_AT })] });
    await expect(service.setStatus(sales, 'k', 'a', to)).rejects.toBeInstanceOf(ConflictException);
    expect(store.get('a')?.status).toBe(from);
  });

  it('409s when restoring into a full class, 404s for an enrollment of another class', async () => {
    const { service } = setup({
      classes: { k: { status: 'OPEN', capacity: 1, teacherIds: [] }, other: { status: 'OPEN', capacity: null, teacherIds: [] } },
      enrollments: [enrollment({ id: 'a', studentId: 'hs-an', status: 'REMOVED', leftAt: ENROLLED_AT }), enrollment({ id: 'b', studentId: 'hs-minh' })],
    });
    await expect(service.setStatus(sales, 'k', 'a', 'ACTIVE')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.setStatus(sales, 'other', 'b', 'COMPLETED')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EnrollmentsService.setStatus restore of a locked account', () => {
  it('409s, as enrolling would: a locked account takes no seat', async () => {
    const { service, store } = setup({ enrollments: [enrollment({ id: 'a', studentId: 'hs-off', status: 'REMOVED', leftAt: ENROLLED_AT })] });
    await expect(service.setStatus(sales, 'k', 'a', 'ACTIVE')).rejects.toBeInstanceOf(ConflictException);
    expect(store.get('a')?.status).toBe('REMOVED');
  });
});

describe('EnrollmentsService.list', () => {
  const enrollments = [enrollment({ id: 'a', studentId: 'hs-an' }), enrollment({ id: 'b', studentId: 'hs-minh', status: 'DROPPED', leftAt: ENROLLED_AT })];

  it('tells what each student can move to next: only a removed student comes back', async () => {
    const { service } = setup({ enrollments: [...enrollments, enrollment({ id: 'c', studentId: 'hs-binh', status: 'REMOVED', leftAt: ENROLLED_AT })] });
    expect(Object.fromEntries((await service.list(sales, 'k')).map(({ status, nextStatuses }) => [status, nextStatuses]))).toEqual({
      ACTIVE: ['COMPLETED', 'DROPPED', 'REMOVED'],
      DROPPED: [],
      REMOVED: ['ACTIVE'],
    });
  });

  it('lists the class’s students for staff and for the class’s own teacher only', async () => {
    const { service } = setup({ enrollments });
    expect((await service.list(sales, 'k')).map(({ studentCode, status }) => `${studentCode}:${status}`)).toEqual(['HS0001:ACTIVE', 'HS0002:DROPPED']);
    await expect(service.list(lan, 'k')).resolves.toHaveLength(2);
    await expect(service.list(nam, 'k')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list(sales, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClassesController enrollments', () => {
  const calls: unknown[][] = [];
  const fake = new Proxy({}, { get: () => vi.fn(async (...args: unknown[]) => calls.push(args)) });
  const controller = new ClassesController(fake as unknown as ClassesService, fake as unknown as EnrollmentsService);
  const ID = '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10';

  it('lets admins and sales enroll and change status; teachers read', () => {
    for (const method of ['enroll', 'setEnrollmentStatus'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, ClassesController.prototype[method])).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES']);
    }
    expect(Reflect.getMetadata(ROLES_KEY, ClassesController.prototype.listEnrollments)).toBeUndefined();
  });

  it('validates the bodies', () => {
    expect(() => controller.enroll(sales, ID, { studentId: 'x' })).toThrow(BadRequestException);
    expect(() => controller.setEnrollmentStatus(sales, ID, ID, { status: 'GONE' })).toThrow(BadRequestException);
    calls.length = 0;
    void controller.enroll(sales, ID, { studentId: ID });
    void controller.setEnrollmentStatus(sales, ID, ID, { status: 'COMPLETED' });
    expect(calls.map((args) => args.slice(1))).toEqual([
      [ID, ID],
      [ID, ID, 'COMPLETED'],
    ]);
  });
});
