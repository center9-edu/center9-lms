import { NotFoundException } from '@nestjs/common';
import type { ClassSessionStatus, ClassStatus, EnrollmentStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { LearnerClassesController } from './learner-classes.controller.js';
import { LearnerClassesService } from './learner-classes.service.js';

// Fake people only: real students are children, never copy their data here.
const NAMES: Record<string, string> = { 'hs-an': 'Lê Bảo An', 'hs-minh': 'Nguyễn Văn Minh', 'hs-binh': 'Trần Bình' };
/** Parent account → children (student user ids), as student_guardians links them through guardians.user_id. */
const CHILDREN: Record<string, string[]> = { 'ph-hung': ['hs-an'], 'ph-other': ['hs-binh'] };

const actor = (id: string, roles: AuthContext['user']['roles']): AuthContext => ({
  sessionId: 's1',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});
const an = actor('hs-an', ['STUDENT']);
const minh = actor('hs-minh', ['STUDENT']);
const hung = actor('ph-hung', ['PARENT']);
const other = actor('ph-other', ['PARENT']);

const vn = (local: string) => new Date(`${local}+07:00`);

interface StoredClass {
  id: string;
  code: string;
  status: ClassStatus;
  enrollments: { studentId: string; status: EnrollmentStatus; attendance?: { classSessionId: string; status: string; note: string | null }[] }[];
  sessions: { id: string; startsAt: Date; status: ClassSessionStatus }[];
}

// Lesson A has 2 parts, lesson B 1. In k1, s3 is cancelled, so B's only part falls on s4 (10/12).
const CURRICULUM = { chapters: [{ lessons: [{ id: 'A', title: 'Biến', partCount: 2 }, { id: 'B', title: 'Vòng lặp', partCount: 1 }] }] };
const FILES = [
  { id: 'fa-pdf', lessonId: 'A', fileName: 'Bài giảng biến.pdf', mimeType: 'application/pdf', sizeBytes: 2048 },
  { id: 'fa-docx', lessonId: 'A', fileName: 'Giáo án biến.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 4096 },
  { id: 'fb-pdf', lessonId: 'B', fileName: 'Bài giảng vòng lặp.pdf', mimeType: 'application/pdf', sizeBytes: 1024 },
];
const session = (id: string, day: string, status: ClassSessionStatus = 'SCHEDULED') => ({ id, startsAt: vn(`${day}T18:00`), status });
const CLASSES: StoredClass[] = [
  {
    id: 'k1',
    code: 'LH0001',
    status: 'IN_PROGRESS',
    enrollments: [
      // Notes are staff-only: the learner DTO must never pass them on.
      {
        studentId: 'hs-an',
        status: 'ACTIVE',
        attendance: [
          { classSessionId: 's1', status: 'PRESENT', note: null },
          { classSessionId: 's2', status: 'ABSENT', note: 'Ốm, mẹ báo nghỉ' },
        ],
      },
      { studentId: 'hs-minh', status: 'ACTIVE', attendance: [{ classSessionId: 's1', status: 'LATE', note: 'Đến muộn' }] },
    ],
    sessions: [session('s1', '2026-12-01'), session('s2', '2026-12-03'), session('s3', '2026-12-08', 'CANCELLED'), session('s4', '2026-12-10')],
  },
  { id: 'k2', code: 'LH0002', status: 'DRAFT', enrollments: [{ studentId: 'hs-an', status: 'ACTIVE' }], sessions: [] },
  { id: 'k3', code: 'LH0003', status: 'OPEN', enrollments: [{ studentId: 'hs-an', status: 'DROPPED' }], sessions: [] },
  { id: 'k4', code: 'LH0004', status: 'COMPLETED', enrollments: [{ studentId: 'hs-an', status: 'COMPLETED' }], sessions: [] },
  { id: 'k5', code: 'LH0005', status: 'CANCELLED', enrollments: [{ studentId: 'hs-an', status: 'ACTIVE' }], sessions: [] },
  { id: 'k6', code: 'LH0006', status: 'OPEN', enrollments: [{ studentId: 'hs-binh', status: 'ACTIVE' }, { studentId: 'hs-an', status: 'REMOVED' }], sessions: [] },
];

type EnrollmentWhere = { status?: { in: EnrollmentStatus[] }; OR?: ({ studentId: string } | { student: { guardians: { some: { guardian: { userId: string } } } } })[] };
type ClassWhere = {
  code?: string;
  status?: { notIn: ClassStatus[] };
  enrollments?: { some: EnrollmentWhere };
  course?: { chapters: { some: { lessons: { some: { id: string } } } } };
};

/**
 * Reads the where the service builds, the way Postgres would: a condition left out filters nothing. So a test
 * fails because a rule is missing, not because this fake cannot read the query.
 */
const matchesEnrollment = (e: StoredClass['enrollments'][number], where: EnrollmentWhere = {}) =>
  (where.status?.in.includes(e.status) ?? true) &&
  (where.OR?.some((condition) =>
    'studentId' in condition ? e.studentId === condition.studentId : (CHILDREN[condition.student.guardians.some.guardian.userId] ?? []).includes(e.studentId),
  ) ??
    true);
const matchesClass = (c: StoredClass, where: ClassWhere) =>
  !(where.status?.notIn.includes(c.status) ?? false) &&
  (where.code === undefined || c.code === where.code) &&
  // Every class here follows CURRICULUM, so a lesson filter only asks whether it is one of its lessons.
  (where.course === undefined || CURRICULUM.chapters.some(({ lessons }) => lessons.some(({ id }) => id === where.course!.chapters.some.lessons.some.id))) &&
  (where.enrollments === undefined || c.enrollments.some((e) => matchesEnrollment(e, where.enrollments!.some)));

function setup() {
  const row = (c: StoredClass, enrollmentWhere: EnrollmentWhere | undefined) => ({
    id: c.id,
    code: c.code,
    name: `Lớp ${c.code}`,
    status: c.status,
    startDate: new Date('2026-12-01T00:00:00Z'),
    endDate: null,
    // Staff-only data the learner DTO must never pass on.
    capacity: 12,
    course: { id: 'c-py', title: 'Python Cơ bản' },
    teachers: [{ roleInClass: 'MAIN_TEACHER' as const, teacher: { user: { fullName: 'Trần Thị Lan' } } }],
    enrollments: c.enrollments
      .filter((e) => matchesEnrollment(e, enrollmentWhere))
      .map((e) => ({ student: { user: { fullName: NAMES[e.studentId] } }, attendance: e.attendance ?? [] })),
  });
  const prisma = {
    class: {
      findMany: vi.fn(async ({ where, select }: { where: ClassWhere; select: { enrollments?: { where?: EnrollmentWhere } } }) =>
        CLASSES.filter((c) => matchesClass(c, where)).map((c) => row(c, select.enrollments?.where)),
      ),
      findFirst: vi.fn(async ({ where, select }: { where: ClassWhere; select: { enrollments: { where?: EnrollmentWhere } } }) => {
        const found = CLASSES.find((c) => matchesClass(c, where));
        return found ? row(found, select.enrollments.where) : null;
      }),
    },
    classSession: {
      // Nothing due to settle here: settling has its own spec (session-plan.spec.ts).
      count: vi.fn(async () => 0),
      findMany: vi.fn(async ({ where }: { where: { classId: string } }) => CLASSES.find((c) => c.id === where.classId)!.sessions.map((s) => ({ ...s, endsAt: new Date(s.startsAt.getTime() + 5_400_000) }))),
    },
    course: { findUnique: vi.fn(async () => CURRICULUM) },
    lessonAttachment: {
      findMany: vi.fn(async ({ where }: { where: { lessonId: { in: string[] }; mimeType: string } }) =>
        FILES.filter((f) => where.lessonId.in.includes(f.lessonId) && f.mimeType === where.mimeType).map(({ id, lessonId, fileName, sizeBytes }) => ({ id, lessonId, fileName, sizeBytes })),
      ),
    },
  };
  return { service: new LearnerClassesService(prisma as unknown as PrismaService), prisma };
}

// Thursday 03/12 at 20:00 in Vietnam: s1 (A part 1) and s2 (A part 2) have come; B waits for s4 on 10/12.
const NOW = vn('2026-12-03T20:00');

describe('LearnerClassesService.list', () => {
  it('shows a student the classes they study or finished, never draft, cancelled, dropped or removed ones', async () => {
    const { service } = setup();
    expect((await service.list(an)).map(({ code }) => code)).toEqual(['LH0001', 'LH0004']);
    expect((await service.list(minh)).map(({ code }) => code)).toEqual(['LH0001']);
  });

  it('shows a parent their children’s classes, naming only their own children', async () => {
    const { service } = setup();
    const classes = await service.list(hung);
    expect(classes.map(({ code, students }) => [code, students])).toEqual([
      ['LH0001', ['Lê Bảo An']],
      ['LH0004', ['Lê Bảo An']],
    ]);
    expect((await service.list(other)).map(({ code }) => code)).toEqual(['LH0006']);
  });

  it('gives a list entry without staff-only fields or classmates', async () => {
    const { service } = setup();
    expect((await service.list(an))[0]).toEqual({
      code: 'LH0001',
      name: 'Lớp LH0001',
      status: 'IN_PROGRESS',
      courseTitle: 'Python Cơ bản',
      startDate: '2026-12-01',
      endDate: null,
      teachers: [{ fullName: 'Trần Thị Lan', role: 'MAIN_TEACHER' }],
      students: ['Lê Bảo An'],
    });
  });
});

describe('LearnerClassesService.getByCode', () => {
  it('lists the sessions with their lesson part, marking which lessons are open today', async () => {
    const { service } = setup();
    const detail = await service.getByCode(an, 'LH0001', NOW);
    expect(detail.sessions.map(({ number, status, lesson }) => [number, status, lesson && `${lesson.title} ${lesson.partNumber}/${lesson.partCount} ${lesson.unlocked ? 'mở' : 'khoá'}`])).toEqual([
      [1, 'SCHEDULED', 'Biến 1/2 mở'],
      [2, 'SCHEDULED', 'Biến 2/2 mở'],
      [null, 'CANCELLED', null],
      [3, 'SCHEDULED', 'Vòng lặp 1/1 khoá'],
    ]);
  });

  it('gives the files of open lessons only, and only PDFs', async () => {
    const { service, prisma } = setup();
    const detail = await service.getByCode(an, 'LH0001', NOW);
    expect(detail.openLessons).toEqual([{ id: 'A', title: 'Biến', files: [{ id: 'fa-pdf', fileName: 'Bài giảng biến.pdf', sizeBytes: 2048 }] }]);
    expect(prisma.lessonAttachment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lessonId: { in: ['A'] }, mimeType: 'application/pdf' } }));
  });

  it('opens the next lesson on its day, from midnight in Vietnam', async () => {
    const { service } = setup();
    expect((await service.getByCode(an, 'LH0001', vn('2026-12-09T23:59'))).openLessons.map(({ id }) => id)).toEqual(['A']);
    expect((await service.getByCode(an, 'LH0001', vn('2026-12-10T00:00'))).openLessons.map(({ id }) => id)).toEqual(['A', 'B']);
  });

  it('never names classmates or passes on staff-only fields', async () => {
    const { service } = setup();
    const detail = await service.getByCode(an, 'LH0001', NOW);
    expect(JSON.stringify(detail)).not.toContain('Nguyễn Văn Minh');
    expect(Object.keys(detail).sort()).toEqual(['attendance', 'code', 'courseTitle', 'endDate', 'name', 'openLessons', 'sessions', 'startDate', 'status', 'students', 'teachers']);
  });

  it('404s for any class the learner may not see', async () => {
    const { service } = setup();
    for (const code of ['LH0002', 'LH0003', 'LH0005', 'LH0006', 'LH9999']) {
      await expect(service.getByCode(an, code, NOW)).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(service.getByCode(minh, 'LH0004', NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getByCode(other, 'LH0001', NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getByCode(hung, 'LH0001', NOW)).resolves.toMatchObject({ students: ['Lê Bảo An'] });
  });
});

describe('LearnerClassesService attendance', () => {
  it('shows each session’s mark for the learner only, without the teacher’s notes', async () => {
    const { service } = setup();
    const detail = await service.getByCode(an, 'LH0001', NOW);
    expect(detail.sessions.map(({ attendance }) => attendance)).toEqual([
      [{ student: 'Lê Bảo An', status: 'PRESENT' }],
      [{ student: 'Lê Bảo An', status: 'ABSENT' }],
      [],
      [],
    ]);
    expect(JSON.stringify(detail)).not.toContain('Ốm');
    expect(JSON.stringify(detail)).not.toContain('Đến muộn');
  });

  it('gives the attendance rate per learner: present or late over the sessions marked', async () => {
    const { service } = setup();
    expect((await service.getByCode(an, 'LH0001', NOW)).attendance).toEqual([{ student: 'Lê Bảo An', attended: 1, marked: 2 }]);
    expect((await service.getByCode(minh, 'LH0001', NOW)).attendance).toEqual([{ student: 'Nguyễn Văn Minh', attended: 1, marked: 1 }]);
  });

  it('shows a parent their own child’s marks only', async () => {
    const { service } = setup();
    const detail = await service.getByCode(hung, 'LH0001', NOW);
    expect(detail.sessions[0]?.attendance).toEqual([{ student: 'Lê Bảo An', status: 'PRESENT' }]);
    expect(detail.attendance).toEqual([{ student: 'Lê Bảo An', attended: 1, marked: 2 }]);
    expect(JSON.stringify(detail)).not.toContain('LATE');
  });
});

describe('LearnerClassesService.canOpenLesson', () => {
  it('is true only for a lesson open today in one of the learner’s classes', async () => {
    const { service } = setup();
    await expect(service.canOpenLesson(an, 'A', NOW)).resolves.toBe(true);
    await expect(service.canOpenLesson(hung, 'A', NOW)).resolves.toBe(true);
    await expect(service.canOpenLesson(an, 'B', NOW)).resolves.toBe(false);
    await expect(service.canOpenLesson(an, 'B', vn('2026-12-10T00:00'))).resolves.toBe(true);
  });

  it('is false for someone outside the class or for an unknown lesson', async () => {
    const { service } = setup();
    // ph-other's child is only in LH0006, which has no sessions yet.
    await expect(service.canOpenLesson(other, 'A', NOW)).resolves.toBe(false);
    await expect(service.canOpenLesson(an, 'Z', NOW)).resolves.toBe(false);
    await expect(service.canOpenLesson(actor('gv-lan', ['TEACHER']), 'A', NOW)).resolves.toBe(false);
  });
});

describe('LearnerClassesController', () => {
  it('is only for students and parents', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LearnerClassesController)).toEqual(['STUDENT', 'PARENT']);
  });
});
