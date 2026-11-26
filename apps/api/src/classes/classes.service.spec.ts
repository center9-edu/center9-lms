import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { ClassStatus, ClassTeacherRole } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';
import type { EnrollmentsService } from './enrollments.service.js';

interface StoredClass {
  id: string;
  code: string;
  name: string;
  courseId: string;
  status: ClassStatus;
  startDate: Date | null;
  endDate: Date | null;
  capacity: number | null;
  createdAt: Date;
  teachers: { teacherId: string; roleInClass: ClassTeacherRole }[];
  activeStudents: number;
}

const actor = (id: string, roles: AuthContext['user']['roles']): AuthContext => ({
  sessionId: 's1',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});
const admin = actor('admin', ['SUPER_ADMIN']);
const sales = actor('nv-ha', ['SALES']);
const lan = actor('gv-lan', ['TEACHER']);
const nam = actor('gv-nam', ['TEACHER', 'SALES']);

const CREATED_AT = new Date('2026-11-26T03:00:00Z');
// The c-py curriculum: lesson A in 2 parts, then lesson B in 1.
const CURRICULUM = [{ lessons: [{ id: 'A', title: 'Biến', partCount: 2 }, { id: 'B', title: 'Vòng lặp', partCount: 1 }] }];
const COURSES = new Map([
  ['c-py', { id: 'c-py', title: 'Python Cơ bản', slug: 'python-co-ban', archivedAt: null as Date | null }],
  ['c-old', { id: 'c-old', title: 'Khoá cũ', slug: 'khoa-cu', archivedAt: CREATED_AT }],
]);
// Teacher profiles by user id; gv-old's account is disabled.
const TEACHERS = new Map([
  ['gv-lan', { teacherCode: 'GV0001', fullName: 'Trần Thị Lan', status: 'ACTIVE' }],
  ['gv-nam', { teacherCode: 'GV0002', fullName: 'Phạm Văn Nam', status: 'ACTIVE' }],
  ['gv-old', { teacherCode: 'GV0003', fullName: 'Lê Văn Cũ', status: 'DISABLED' }],
]);
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

function stored(overrides: Partial<StoredClass> & { id: string; code: string }): StoredClass {
  return {
    name: overrides.code,
    courseId: 'c-py',
    status: 'DRAFT',
    startDate: null,
    endDate: null,
    capacity: null,
    createdAt: CREATED_AT,
    teachers: [],
    activeStudents: 0,
    ...overrides,
  };
}

interface StoredSession {
  id: string;
  classId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

function setup(classes: StoredClass[] = [], { codeCollisions = 0, sessions = [] as StoredSession[], marks = [] as { classSessionId: string }[] } = {}) {
  const attendance = [...marks];
  type SessionWhere = { classId: string; status: StoredSession['status']; startsAt: { gt: Date } };
  const matches = (session: StoredSession, where: SessionWhere) => session.classId === where.classId && session.status === where.status && session.startsAt > where.startsAt.gt;
  const store = new Map(classes.map((c) => [c.id, { ...c }]));
  const audit: { action: string; entityId: string; metadata?: unknown }[] = [];
  let nextId = 1;
  let collisionsLeft = codeCollisions;
  // What Prisma returns for the include the service asks for.
  const withRelations = (c: StoredClass) => {
    const { id, title, slug } = COURSES.get(c.courseId)!;
    // Main teacher first, as the service orders them.
    const teachers = [...c.teachers]
      .sort((a, b) => Number(a.roleInClass === 'ASSISTANT') - Number(b.roleInClass === 'ASSISTANT'))
      .map(({ teacherId, roleInClass }) => {
        const { teacherCode, fullName } = TEACHERS.get(teacherId)!;
        return { roleInClass, teacher: { userId: teacherId, teacherCode, user: { fullName } } };
      });
    return { ...c, course: { id, title, slug }, teachers, _count: { enrollments: c.activeStudents } };
  };
  const visible = (where: { teachers?: { some: { teacherId: string } } } | undefined, c: StoredClass) =>
    !where?.teachers || c.teachers.some(({ teacherId }) => teacherId === where.teachers!.some.teacherId);
  const locked: string[] = [];

  const prisma = {
    // Either the class row lock (SELECT status … FOR UPDATE) or nextProfileCode('LH'): the highest LH number in use.
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, id?: string) => {
      if (strings.join('?').includes('FOR UPDATE')) {
        locked.push(id!);
        const found = store.get(id!);
        return found ? [{ status: found.status }] : [];
      }
      const numbers = [...store.values()].map((c) => /^LH(\d+)$/.exec(c.code)?.[1]).filter(Boolean).map(Number);
      return [{ max: numbers.length ? Math.max(...numbers) : null }];
    }),
    teacherProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const found = TEACHERS.get(where.userId);
        return found ? { user: { status: found.status } } : null;
      }),
    },
    classTeacher: {
      updateMany: vi.fn(async ({ where, data }: { where: { classId: string; roleInClass: ClassTeacherRole; teacherId: { not: string } }; data: { roleInClass: ClassTeacherRole } }) => {
        for (const t of store.get(where.classId)!.teachers) {
          if (t.roleInClass === where.roleInClass && t.teacherId !== where.teacherId.not) {
            t.roleInClass = data.roleInClass;
          }
        }
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { classId_teacherId: { classId: string; teacherId: string } }; create: { roleInClass: ClassTeacherRole }; update: { roleInClass: ClassTeacherRole } }) => {
        const { classId, teacherId } = where.classId_teacherId;
        const teachers = store.get(classId)!.teachers;
        const existing = teachers.find((t) => t.teacherId === teacherId);
        if (existing) {
          existing.roleInClass = update.roleInClass;
        } else {
          teachers.push({ teacherId, roleInClass: create.roleInClass });
        }
      }),
      deleteMany: vi.fn(async ({ where }: { where: { classId: string; teacherId: string } }) => {
        const c = store.get(where.classId)!;
        const before = c.teachers.length;
        c.teachers = c.teachers.filter((t) => t.teacherId !== where.teacherId);
        return { count: before - c.teachers.length };
      }),
    },
    course: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = COURSES.get(where.id);
        return found ? { ...found, chapters: where.id === 'c-py' ? CURRICULUM : [] } : null;
      }),
    },
    classSession: {
      // Nothing due to settle here: settling has its own spec (session-plan.spec.ts).
      count: vi.fn(async () => 0),
      findMany: vi.fn(async ({ where }: { where: { classId: string } }) => sessions.filter((session) => session.classId === where.classId)),
      updateMany: vi.fn(async ({ where, data }: { where: SessionWhere; data: { status: StoredSession['status'] } }) => {
        const hit = sessions.filter((session) => matches(session, where));
        hit.forEach((session) => Object.assign(session, data));
        return { count: hit.length };
      }),
    },
    attendance: {
      deleteMany: vi.fn(async ({ where }: { where: { classSession: SessionWhere } }) => {
        const gone = new Set(sessions.filter((session) => matches(session, where.classSession)).map(({ id }) => id));
        attendance.splice(0, attendance.length, ...attendance.filter((mark) => !gone.has(mark.classSessionId)));
      }),
    },
    class: {
      findMany: vi.fn(async ({ where }: { where?: { teachers?: { some: { teacherId: string } } } }) =>
        [...store.values()].filter((c) => visible(where, c)).map(withRelations),
      ),
      findFirst: vi.fn(async ({ where }: { where: { code?: string; id?: string; teachers?: { some: { teacherId: string } } } }) => {
        const found = [...store.values()].find((c) => (where.code ? c.code === where.code : c.id === where.id) && visible(where, c));
        return found ? withRelations(found) : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = store.get(where.id);
        return found ? withRelations(found) : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<StoredClass, 'id' | 'createdAt' | 'teachers' | 'activeStudents' | 'status'> }) => {
        if (collisionsLeft > 0) {
          collisionsLeft -= 1;
          // Another request saved the same code first.
          store.set(`race-${data.code}`, stored({ id: `race-${data.code}`, code: data.code }));
          throw unique();
        }
        const created = stored({ ...data, id: `k${nextId++}` });
        store.set(created.id, created);
        return withRelations(created);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredClass> }) => withRelations(Object.assign(store.get(where.id)!, data))),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { service: new ClassesService(prisma as unknown as PrismaService), store, audit, locked, attendance };
}

const NEW_CLASS = { courseId: 'c-py', name: 'Python Cơ bản – Tối T3/T5', startDate: '2026-12-01', endDate: null, capacity: 12 };

describe('ClassesService.create', () => {
  it('creates a draft class with the next LH code and audits it', async () => {
    const { service, audit } = setup([stored({ id: 'a', code: 'LH0009' })]);
    await expect(service.create(admin, NEW_CLASS)).resolves.toEqual({
      id: 'k1',
      code: 'LH0010',
      name: 'Python Cơ bản – Tối T3/T5',
      status: 'DRAFT',
      course: { id: 'c-py', title: 'Python Cơ bản', slug: 'python-co-ban' },
      startDate: '2026-12-01',
      endDate: null,
      capacity: 12,
      activeStudentCount: 0,
      nextStatuses: ['OPEN', 'CANCELLED'],
      teachers: [],
    });
    expect(audit).toEqual([{ actorId: 'admin', action: 'class.created', entityType: 'class', entityId: 'k1', metadata: { code: 'LH0010', courseId: 'c-py' } }]);
  });

  it('numbers the first class LH0001 and retries when another request took the code', async () => {
    const { service } = setup([], { codeCollisions: 1 });
    await expect(service.create(admin, NEW_CLASS)).resolves.toMatchObject({ code: 'LH0002' });
  });

  it('404s for an unknown course and 409s for an archived one', async () => {
    const { service } = setup();
    await expect(service.create(admin, { ...NEW_CLASS, courseId: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.create(admin, { ...NEW_CLASS, courseId: 'c-old' })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ClassesService reads', () => {
  const classes = [
    stored({ id: 'a', code: 'LH0001', teachers: [{ teacherId: 'gv-lan', roleInClass: 'MAIN_TEACHER' }] }),
    stored({ id: 'b', code: 'LH0002', teachers: [{ teacherId: 'gv-nam', roleInClass: 'ASSISTANT' }], activeStudents: 3 }),
  ];

  it('shows every class to admins and sales, and to a teacher who is also sales', async () => {
    for (const who of [admin, sales, nam]) {
      const { service } = setup(classes);
      expect((await service.list(who)).map((c) => c.code)).toEqual(['LH0001', 'LH0002']);
    }
  });

  it('shows a teacher only the classes they teach, and 404s for another one', async () => {
    const { service } = setup(classes);
    expect((await service.list(lan)).map((c) => c.code)).toEqual(['LH0001']);
    await expect(service.getByCode(lan, 'LH0001')).resolves.toMatchObject({ code: 'LH0001' });
    await expect(service.getByCode(lan, 'LH0002')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getByCode(admin, 'LH0002')).resolves.toMatchObject({ activeStudentCount: 3 });
  });
});

describe('ClassesService class detail', () => {
  const vn = (local: string) => new Date(`${local}+07:00`);
  const at = (id: string, day: string, status: StoredSession['status'] = 'SCHEDULED'): StoredSession => ({
    id,
    classId: 'a',
    startsAt: vn(`${day}T18:00`),
    endsAt: vn(`${day}T19:30`),
    status,
  });

  it('numbers the sessions that are not cancelled and gives each its lesson part, in curriculum order', async () => {
    // Sessions arrive out of order; s2 is cancelled, so its part moves to s3.
    const { service } = setup([stored({ id: 'a', code: 'LH0001' })], { sessions: [at('s3', '2026-12-08'), at('s1', '2026-12-01'), at('s2', '2026-12-03', 'CANCELLED')] });
    const detail = await service.getByCode(admin, 'LH0001');
    expect(detail.sessions).toEqual([
      { id: 's1', number: 1, startsAt: vn('2026-12-01T18:00').toISOString(), endsAt: vn('2026-12-01T19:30').toISOString(), status: 'SCHEDULED', lesson: { id: 'A', title: 'Biến', partNumber: 1, partCount: 2 } },
      { id: 's2', number: null, startsAt: vn('2026-12-03T18:00').toISOString(), endsAt: vn('2026-12-03T19:30').toISOString(), status: 'CANCELLED', lesson: null },
      { id: 's3', number: 2, startsAt: vn('2026-12-08T18:00').toISOString(), endsAt: vn('2026-12-08T19:30').toISOString(), status: 'SCHEDULED', lesson: { id: 'A', title: 'Biến', partNumber: 2, partCount: 2 } },
    ]);
    expect(detail.totalParts).toBe(3);
    expect(detail.missingSessions).toBe(1);
  });

  it('has no sessions and every part missing before a schedule is made', async () => {
    const { service } = setup([stored({ id: 'a', code: 'LH0001' })]);
    await expect(service.getByCode(admin, 'LH0001')).resolves.toMatchObject({ sessions: [], totalParts: 3, missingSessions: 3 });
  });
});

describe('ClassesService.update', () => {
  const input = { name: 'Lớp mới', startDate: '2026-12-01', endDate: '2027-02-01', capacity: 5 };

  it('replaces the editable fields under the class lock (so the seat count holds against an enrollment) and audits it', async () => {
    const { service, audit, locked } = setup([stored({ id: 'a', code: 'LH0001' })]);
    await expect(service.update(admin, 'a', input)).resolves.toMatchObject({ name: 'Lớp mới', startDate: '2026-12-01', endDate: '2027-02-01', capacity: 5 });
    expect(locked).toEqual(['a']);
    expect(audit.map((entry) => entry.action)).toEqual(['class.updated']);
  });

  it('409s for a capacity below the active students, and for a finished or cancelled class', async () => {
    const { service } = setup([
      stored({ id: 'a', code: 'LH0001', activeStudents: 6 }),
      stored({ id: 'b', code: 'LH0002', status: 'COMPLETED' }),
      stored({ id: 'c', code: 'LH0003', status: 'CANCELLED' }),
    ]);
    await expect(service.update(admin, 'a', input)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(admin, 'a', { ...input, capacity: null })).resolves.toMatchObject({ capacity: null });
    await expect(service.update(admin, 'b', input)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(admin, 'c', input)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(admin, 'missing', input)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClassesService.setStatus', () => {
  it.each([
    ['DRAFT', 'OPEN'],
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['DRAFT', 'CANCELLED'],
    ['OPEN', 'CANCELLED'],
    ['IN_PROGRESS', 'CANCELLED'],
  ] as const)('moves %s to %s under the class lock and audits it', async (from, to) => {
    const { service, audit, locked } = setup([stored({ id: 'a', code: 'LH0001', status: from })]);
    await expect(service.setStatus(admin, 'a', to)).resolves.toMatchObject({ status: to });
    // Two admins at once must not both pass the transition check.
    expect(locked).toEqual(['a']);
    expect(audit).toEqual([
      { actorId: 'admin', action: 'class.status_changed', entityType: 'class', entityId: 'a', metadata: { from, to, ...(to === 'COMPLETED' && { sessionsCancelled: 0 }) } },
    ]);
  });

  it('cancels the sessions not started yet when a class ends early, with their marks, so none is settled as taught', async () => {
    const at = (id: string, day: string, status: StoredSession['status'] = 'SCHEDULED'): StoredSession => ({
      id,
      classId: 'a',
      startsAt: new Date(`${day}T18:00:00+07:00`),
      endsAt: new Date(`${day}T19:30:00+07:00`),
      status,
    });
    // Today is after 2026-11-02 and before 2099: the first two are over (one not settled yet), the others to come.
    const sessions = [at('done', '2026-11-02', 'COMPLETED'), at('unsettled', '2026-11-04'), at('next', '2099-01-05'), at('off', '2099-01-07', 'CANCELLED')];
    const marks = [{ classSessionId: 'unsettled' }, { classSessionId: 'next' }];
    const { service, audit, attendance } = setup([stored({ id: 'a', code: 'LH0001', status: 'IN_PROGRESS' })], { sessions, marks });
    await service.setStatus(admin, 'a', 'COMPLETED');
    expect(sessions.map(({ id, status }) => `${id}:${status}`)).toEqual(['done:COMPLETED', 'unsettled:SCHEDULED', 'next:CANCELLED', 'off:CANCELLED']);
    expect(attendance).toEqual([{ classSessionId: 'unsettled' }]);
    expect(audit[0]?.metadata).toEqual({ from: 'IN_PROGRESS', to: 'COMPLETED', sessionsCancelled: 1 });
  });

  it('lists the statuses the class can move to next, none once it is finished or cancelled', async () => {
    const { service } = setup([stored({ id: 'a', code: 'LH0001', status: 'OPEN' })]);
    await expect(service.getByCode(admin, 'LH0001')).resolves.toMatchObject({ nextStatuses: ['IN_PROGRESS', 'CANCELLED'] });
    await expect(service.setStatus(admin, 'a', 'IN_PROGRESS')).resolves.toMatchObject({ nextStatuses: ['COMPLETED', 'CANCELLED'] });
    await expect(service.setStatus(admin, 'a', 'COMPLETED')).resolves.toMatchObject({ nextStatuses: [] });
  });

  it.each([
    ['DRAFT', 'IN_PROGRESS'],
    ['OPEN', 'DRAFT'],
    ['COMPLETED', 'CANCELLED'],
    ['CANCELLED', 'OPEN'],
    ['OPEN', 'OPEN'],
  ] as const)('409s for %s to %s', async (from, to) => {
    const { service, store } = setup([stored({ id: 'a', code: 'LH0001', status: from })]);
    await expect(service.setStatus(admin, 'a', to)).rejects.toBeInstanceOf(ConflictException);
    expect(store.get('a')?.status).toBe(from);
  });
});

describe('ClassesService teachers', () => {
  const names = (dto: { teachers: { userId: string; role: ClassTeacherRole }[] }) => dto.teachers.map(({ userId, role }) => `${userId}:${role}`);

  it('assigns a teacher under the class lock, lists them with their code and name, and audits it', async () => {
    const { service, audit, locked } = setup([stored({ id: 'a', code: 'LH0001' })]);
    const dto = await service.assignTeacher(admin, 'a', 'gv-lan', 'MAIN_TEACHER');
    expect(dto.teachers).toEqual([{ userId: 'gv-lan', teacherCode: 'GV0001', fullName: 'Trần Thị Lan', role: 'MAIN_TEACHER' }]);
    expect(locked).toEqual(['a']);
    expect(audit).toEqual([{ actorId: 'admin', action: 'class.teacher_assigned', entityType: 'class', entityId: 'a', metadata: { teacherId: 'gv-lan', role: 'MAIN_TEACHER' } }]);
  });

  it('keeps at most one main teacher: a new main teacher turns the old one into an assistant', async () => {
    const { service } = setup([stored({ id: 'a', code: 'LH0001', teachers: [{ teacherId: 'gv-lan', roleInClass: 'MAIN_TEACHER' }] })]);
    expect(names(await service.assignTeacher(admin, 'a', 'gv-nam', 'MAIN_TEACHER'))).toEqual(['gv-nam:MAIN_TEACHER', 'gv-lan:ASSISTANT']);
    expect(names(await service.assignTeacher(admin, 'a', 'gv-lan', 'MAIN_TEACHER'))).toEqual(['gv-lan:MAIN_TEACHER', 'gv-nam:ASSISTANT']);
    expect(names(await service.assignTeacher(admin, 'a', 'gv-lan', 'ASSISTANT'))).toEqual(['gv-lan:ASSISTANT', 'gv-nam:ASSISTANT']);
  });

  it('lets the assigned teacher see the class, and not once removed', async () => {
    const { service, audit } = setup([stored({ id: 'a', code: 'LH0001' })]);
    await service.assignTeacher(admin, 'a', 'gv-lan', 'ASSISTANT');
    await expect(service.getByCode(lan, 'LH0001')).resolves.toMatchObject({ code: 'LH0001' });
    await expect(service.removeTeacher(admin, 'a', 'gv-lan')).resolves.toMatchObject({ teachers: [] });
    await expect(service.getByCode(lan, 'LH0001')).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.map(({ action }) => action)).toEqual(['class.teacher_assigned', 'class.teacher_removed']);
  });

  it('404s for an unknown class, teacher or assignment; 409s for a disabled teacher or a closed class', async () => {
    const { service } = setup([stored({ id: 'a', code: 'LH0001' }), stored({ id: 'b', code: 'LH0002', status: 'COMPLETED' })]);
    await expect(service.assignTeacher(admin, 'missing', 'gv-lan', 'ASSISTANT')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assignTeacher(admin, 'a', 'not-a-teacher', 'ASSISTANT')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeTeacher(admin, 'a', 'gv-nam')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assignTeacher(admin, 'a', 'gv-old', 'ASSISTANT')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.assignTeacher(admin, 'b', 'gv-lan', 'ASSISTANT')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.removeTeacher(admin, 'b', 'gv-lan')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ClassesController', () => {
  const calls: unknown[][] = [];
  const fake = new Proxy({}, { get: () => vi.fn(async (...args: unknown[]) => calls.push(args)) });
  const controller = new ClassesController(fake as unknown as ClassesService, fake as unknown as EnrollmentsService);
  const ID = '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10';

  it('lets staff and teachers read, and only admins write', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ClassesController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES', 'TEACHER']);
    for (const method of ['create', 'update', 'setStatus', 'assignTeacher', 'removeTeacher'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, ClassesController.prototype[method])).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN']);
    }
  });

  it('trims the name and passes optional fields as null', () => {
    calls.length = 0;
    void controller.create(admin, { courseId: ID, name: '  Lớp A ' });
    expect(calls[0]?.[1]).toEqual({ courseId: ID, name: 'Lớp A', startDate: null, endDate: null, capacity: null });
  });

  it.each([
    {},
    { courseId: 'not-a-uuid', name: 'A' },
    { courseId: ID, name: ' ' },
    { courseId: ID, name: 'x'.repeat(151) },
    { courseId: ID, name: 'A', startDate: '01/12/2026' },
    { courseId: ID, name: 'A', capacity: 0 },
    { courseId: ID, name: 'A', capacity: 2.5 },
    { courseId: ID, name: 'A', startDate: '2026-12-10', endDate: '2026-12-01' },
  ])('rejects class %j', (body) => {
    expect(() => controller.create(admin, body)).toThrow(BadRequestException);
  });

  it('accepts only known teacher roles', () => {
    expect(() => controller.assignTeacher(admin, ID, ID, { role: 'HEAD' })).toThrow(BadRequestException);
    calls.length = 0;
    void controller.assignTeacher(admin, ID, ID, { role: 'ASSISTANT' });
    expect(calls[0]?.slice(1)).toEqual([ID, ID, 'ASSISTANT']);
  });

  it('accepts only known statuses', () => {
    expect(() => controller.setStatus(admin, ID, { status: 'DONE' })).toThrow(BadRequestException);
    calls.length = 0;
    void controller.setStatus(admin, ID, { status: 'OPEN' });
    expect(calls[0]?.[2]).toBe('OPEN');
  });
});
