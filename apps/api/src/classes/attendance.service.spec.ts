import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AttendanceStatus, ClassSessionStatus, ClassStatus, EnrollmentStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

// Fake people only: real students are children, never copy their data here.
const actor = (id: string, roles: AuthContext['user']['roles']): AuthContext => ({
  sessionId: 's1',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});
const lan = actor('gv-lan', ['TEACHER']);
const nam = actor('gv-nam', ['TEACHER', 'SALES']);
const other = actor('gv-other', ['TEACHER']);
const admin = actor('admin', ['SUPER_ADMIN']);

const vn = (local: string) => new Date(`${local}+07:00`);
// The session: Tuesday 01/12, 18:00–19:30 in Vietnam; attendance opens at 17:45.
const STARTS = vn('2026-12-01T18:00');
const OPEN = vn('2026-12-01T17:45');

const STUDENTS: Record<string, { studentCode: string; fullName: string }> = {
  'hs-an': { studentCode: 'HS0001', fullName: 'Lê Bảo An' },
  'hs-minh': { studentCode: 'HS0002', fullName: 'Nguyễn Văn Minh' },
  'hs-binh': { studentCode: 'HS0003', fullName: 'Trần Bình' },
  'hs-tu': { studentCode: 'HS0004', fullName: 'Đỗ Anh Tú' },
};
const TEACHERS: Record<string, { teacherCode: string; fullName: string; status: string }> = {
  'gv-lan': { teacherCode: 'GV0001', fullName: 'Trần Thị Lan', status: 'ACTIVE' },
  'gv-nam': { teacherCode: 'GV0002', fullName: 'Phạm Văn Nam', status: 'ACTIVE' },
  'gv-old': { teacherCode: 'GV0003', fullName: 'Lê Văn Cũ', status: 'DISABLED' },
};

interface Row {
  enrollmentId: string;
  status: AttendanceStatus;
  note: string | null;
  markedById: string | null;
}

function setup({ classStatus = 'IN_PROGRESS' as ClassStatus, sessionStatus = 'SCHEDULED' as ClassSessionStatus, rows = [] as Row[] } = {}) {
  // An is studying; Minh dropped out after being marked once; Binh was removed and never marked; Tu joined after the session.
  const before = vn('2026-11-20T09:00');
  const enrollments: { id: string; studentId: string; status: EnrollmentStatus; enrolledAt: Date }[] = [
    { id: 'e-an', studentId: 'hs-an', status: 'ACTIVE', enrolledAt: before },
    { id: 'e-minh', studentId: 'hs-minh', status: 'DROPPED', enrolledAt: before },
    { id: 'e-binh', studentId: 'hs-binh', status: 'REMOVED', enrolledAt: before },
    { id: 'e-tu', studentId: 'hs-tu', status: 'ACTIVE', enrolledAt: vn('2026-12-05T09:00') },
  ];
  const attendance = new Map(rows.map((row) => [row.enrollmentId, { ...row }]));
  const session = { id: 's', classId: 'k', startsAt: STARTS, endsAt: vn('2026-12-01T19:30'), status: sessionStatus, taughtById: null as string | null };
  const audit: { actorId: string; action: string; entityType: string; entityId: string; metadata?: unknown }[] = [];
  const locked: string[] = [];
  const classTeachers = ['gv-lan'];

  const sessionRow = () => ({
    ...session,
    class: { code: 'LH0001', status: classStatus },
    taughtBy: session.taughtById ? { userId: session.taughtById, user: { fullName: TEACHERS[session.taughtById]!.fullName } } : null,
  });
  const prisma = {
    // The class row lock (SELECT status, capacity … FOR UPDATE).
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, classId: string) => {
      locked.push(classId);
      return [{ status: classStatus, capacity: null }];
    }),
    class: {
      // Visibility: staff see the class; a teacher only if they teach it.
      findFirst: vi.fn(async ({ where }: { where: { teachers?: { some: { teacherId: string } } } }) =>
        !where.teachers || classTeachers.includes(where.teachers.some.teacherId) ? { id: 'k' } : null,
      ),
    },
    classTeacher: {
      findUnique: vi.fn(async ({ where }: { where: { classId_teacherId: { teacherId: string } } }) =>
        classTeachers.includes(where.classId_teacherId.teacherId) ? { teacherId: where.classId_teacherId.teacherId } : null,
      ),
    },
    classSession: {
      // Nothing due to settle here: settling has its own spec.
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 's' ? sessionRow() : null)),
      update: vi.fn(async ({ data }: { data: { taughtById: string | null } }) => Object.assign(session, data)),
    },
    classEnrollment: {
      // The roster: active students enrolled by the end of the session, and anyone already marked in it.
      findMany: vi.fn(async ({ where }: { where: { OR: [{ status: EnrollmentStatus; enrolledAt?: { lte: Date } }, unknown] } }) =>
        enrollments
          .filter((e) => (e.status === where.OR[0].status && (!where.OR[0].enrolledAt || e.enrolledAt <= where.OR[0].enrolledAt.lte)) || attendance.has(e.id))
          .map((e) => {
            const row = attendance.get(e.id);
            return { id: e.id, status: e.status, student: { studentCode: STUDENTS[e.studentId]!.studentCode, user: { fullName: STUDENTS[e.studentId]!.fullName } }, attendance: row ? [{ status: row.status, note: row.note }] : [] };
          }),
      ),
    },
    teacherProfile: {
      findMany: vi.fn(async () =>
        Object.entries(TEACHERS)
          .filter(([, t]) => t.status === 'ACTIVE')
          .map(([userId, t]) => ({ userId, teacherCode: t.teacherCode, user: { fullName: t.fullName } })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => (TEACHERS[where.userId] ? { user: { status: TEACHERS[where.userId]!.status } } : null)),
    },
    attendance: {
      upsert: vi.fn(async ({ where, create, update }: { where: { classSessionId_enrollmentId: { enrollmentId: string } }; create: Row; update: Partial<Row> }) => {
        const id = where.classSessionId_enrollmentId.enrollmentId;
        attendance.set(id, attendance.has(id) ? { ...attendance.get(id)!, ...update } : { ...create, enrollmentId: id });
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { service: new AttendanceService(prisma as unknown as PrismaService), attendance, session, audit, locked };
}

describe('AttendanceService.get', () => {
  it('lists active students and anyone already marked, with their marks, and when attendance opens', async () => {
    const { service } = setup({ rows: [{ enrollmentId: 'e-minh', status: 'ABSENT', note: 'Ốm', markedById: 'gv-lan' }] });
    const sheet = await service.get(lan, 's', OPEN);
    expect(sheet.opensAt).toBe(OPEN.toISOString());
    expect(sheet.students).toEqual([
      { enrollmentId: 'e-an', studentCode: 'HS0001', fullName: 'Lê Bảo An', enrollmentStatus: 'ACTIVE', status: null, note: null },
      { enrollmentId: 'e-minh', studentCode: 'HS0002', fullName: 'Nguyễn Văn Minh', enrollmentStatus: 'DROPPED', status: 'ABSENT', note: 'Ốm' },
    ]);
  });

  it('is editable only for the class’s teachers, from 15 minutes before the start', async () => {
    const { service } = setup();
    expect((await service.get(lan, 's', new Date(OPEN.getTime() - 1))).editable).toBe(false);
    expect((await service.get(lan, 's', OPEN)).editable).toBe(true);
    expect((await service.get(admin, 's', OPEN)).editable).toBe(false);
    expect((await service.get(nam, 's', OPEN)).editable).toBe(false);
  });

  it('offers active teachers as the one who taught, only to someone who may edit', async () => {
    const { service } = setup();
    expect((await service.get(lan, 's', OPEN)).teacherOptions.map(({ teacherCode }) => teacherCode)).toEqual(['GV0001', 'GV0002']);
    expect((await service.get(admin, 's', OPEN)).teacherOptions).toEqual([]);
  });

  it('is not editable for a cancelled session or a closed class', async () => {
    expect((await setup({ sessionStatus: 'CANCELLED' }).service.get(lan, 's', OPEN)).editable).toBe(false);
    expect((await setup({ classStatus: 'COMPLETED' }).service.get(lan, 's', OPEN)).editable).toBe(false);
  });

  it('404s for a teacher of another class and for an unknown session', async () => {
    const { service } = setup();
    await expect(service.get(other, 's', OPEN)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(admin, 'missing', OPEN)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AttendanceService.save', () => {
  const marks = [{ enrollmentId: 'e-an', status: 'PRESENT' as const, note: null }];

  it('saves the marks under the class lock, recording who marked, and audits without personal data', async () => {
    const { service, attendance, audit, locked } = setup();
    await service.save(lan, 's', { records: marks }, OPEN);
    expect(attendance.get('e-an')).toMatchObject({ status: 'PRESENT', note: null, markedById: 'gv-lan' });
    expect(locked).toEqual(['k']);
    expect(audit).toEqual([{ actorId: 'gv-lan', action: 'attendance.saved', entityType: 'class_session', entityId: 's', metadata: { classId: 'k', records: 1 } }]);
  });

  it('changes a mark already saved instead of adding another', async () => {
    const { service, attendance } = setup({ rows: [{ enrollmentId: 'e-an', status: 'ABSENT', note: null, markedById: 'gv-lan' }] });
    await service.save(lan, 's', { records: [{ enrollmentId: 'e-an', status: 'LATE', note: 'Đến lúc 18:10' }] }, OPEN);
    expect(attendance.size).toBe(1);
    // The correction also records when it was made.
    expect(attendance.get('e-an')).toEqual({ enrollmentId: 'e-an', status: 'LATE', note: 'Đến lúc 18:10', markedById: 'gv-lan', markedAt: OPEN });
  });

  it('409s before attendance opens and for a cancelled session or a closed class', async () => {
    await expect(setup().service.save(lan, 's', { records: marks }, new Date(OPEN.getTime() - 60_000))).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ sessionStatus: 'CANCELLED' }).service.save(lan, 's', { records: marks }, OPEN)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ classStatus: 'COMPLETED' }).service.save(lan, 's', { records: marks }, OPEN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets only the class’s teachers mark: not admins, sales or teachers of other classes', async () => {
    for (const who of [admin, nam, other]) {
      const { service, attendance } = setup();
      await expect(service.save(who, 's', { records: marks }, OPEN)).rejects.toBeInstanceOf(ForbiddenException);
      expect(attendance.size).toBe(0);
    }
  });

  it('400s for a student outside the roster or listed twice', async () => {
    const { service, attendance } = setup();
    await expect(service.save(lan, 's', { records: [{ enrollmentId: 'e-binh', status: 'PRESENT', note: null }] }, OPEN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save(lan, 's', { records: [...marks, ...marks] }, OPEN)).rejects.toBeInstanceOf(BadRequestException);
    expect(attendance.size).toBe(0);
  });

  it('records a substitute who taught the session, who must be an active teacher', async () => {
    const { service, session } = setup();
    await service.save(lan, 's', { records: marks, taughtBy: 'gv-nam' }, OPEN);
    expect(session.taughtById).toBe('gv-nam');
    await expect(setup().service.save(lan, 's', { records: marks, taughtBy: 'gv-old' }, OPEN)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup().service.save(lan, 's', { records: marks, taughtBy: 'nobody' }, OPEN)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AttendanceController', () => {
  const calls: unknown[][] = [];
  const controller = new AttendanceController(new Proxy({}, { get: () => vi.fn(async (...args: unknown[]) => calls.push(args)) }) as unknown as AttendanceService);
  const ID = '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10';

  it('lets staff read and only teachers write (the service checks it is their class)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AttendanceController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES', 'TEACHER']);
    expect(Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.save)).toEqual(['TEACHER']);
  });

  it.each([
    {},
    { records: 'x' },
    { records: [{ enrollmentId: 'x', status: 'PRESENT' }] },
    { records: [{ enrollmentId: ID, status: 'HERE' }] },
    { records: [{ enrollmentId: ID, status: 'PRESENT', note: 'x'.repeat(501) }] },
    { records: [], taughtBy: 'x' },
  ])('rejects %j', (body) => {
    expect(() => controller.save(lan, ID, body)).toThrow(BadRequestException);
  });

  it('trims notes, turns blank ones into null and passes a substitute through', () => {
    calls.length = 0;
    void controller.save(lan, ID, { records: [{ enrollmentId: ID, status: 'LATE', note: '  ' }], taughtBy: ID });
    expect(calls[0]?.[2]).toEqual({ records: [{ enrollmentId: ID, status: 'LATE', note: null }], taughtBy: ID });
  });
});

describe('AttendanceService sheet of a student who joined later', () => {
  it('leaves out a student enrolled after the session, and refuses a mark for them', async () => {
    const { service } = setup();
    const sheet = await service.get(lan, 's', vn('2026-12-01T18:05'));
    expect(sheet.students.map(({ studentCode }) => studentCode)).toEqual(['HS0001']);
    await expect(service.save(lan, 's', { records: [{ enrollmentId: 'e-tu', status: 'PRESENT', note: null }] }, vn('2026-12-01T18:05'))).rejects.toBeInstanceOf(BadRequestException);
  });
});
