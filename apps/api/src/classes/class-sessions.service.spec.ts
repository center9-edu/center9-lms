import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ClassSessionStatus, ClassStatus } from '@center9/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { ClassSessionsController } from './class-sessions.controller.js';
import { ClassSessionsService } from './class-sessions.service.js';
import type { ClassesService } from './classes.service.js';

interface StoredSession {
  id: string;
  classId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  status: ClassSessionStatus;
}

const admin: AuthContext = {
  sessionId: 's1',
  user: { id: 'admin', username: 'admin', fullName: 'Quản trị viên', roles: ['SUPER_ADMIN'], mustChangePassword: false },
};
const vn = (local: string) => new Date(`${local}+07:00`);
const teacher = (id: string, roles: AuthContext['user']['roles']): AuthContext => ({
  sessionId: 's2',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});
const lan = teacher('gv-lan', ['TEACHER']);
// Teaches another class; as sales, they can still see this one.
const nam = teacher('gv-nam', ['TEACHER', 'SALES']);
const PATTERN = { scheduleWeekdays: [2, 4], scheduleStartTime: '18:00', scheduleEndTime: '19:30' };

// The class's course has 3 parts: lesson A in 2 parts, lesson B in 1.
const CURRICULUM = { chapters: [{ lessons: [{ id: 'A', partCount: 2 }, { id: 'B', partCount: 1 }] }] };

function setup({
  status = 'OPEN' as ClassStatus,
  sessions = [] as StoredSession[],
  curriculum = CURRICULUM,
  pattern = PATTERN,
  teachers = ['gv-lan'],
  marks = [] as { classSessionId: string; enrollmentId: string }[],
} = {}) {
  const store = new Map(sessions.map((s) => [s.id, { ...s }]));
  const attendance = [...marks];
  const audit: { action: string; entityType: string; entityId: string; metadata?: unknown }[] = [];
  const locked: string[] = [];
  const classUpdates: Record<string, unknown>[] = [];
  let nextId = 1;
  const prisma = {
    // The class row lock: SELECT status, capacity … FOR UPDATE.
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, classId: string) => {
      locked.push(classId);
      return classId === 'k' ? [{ status, capacity: null }] : [];
    }),
    class: {
      findUnique: vi.fn(async () => ({ course: curriculum, ...pattern })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => classUpdates.push(data)),
    },
    classSession: {
      count: vi.fn(async ({ where }: { where: { classId: string } }) => [...store.values()].filter((s) => s.classId === where.classId).length),
      createMany: vi.fn(async ({ data }: { data: Omit<StoredSession, 'id' | 'status'>[] }) => {
        for (const row of data) {
          const id = `s${nextId++}`;
          store.set(id, { ...row, id, status: 'SCHEDULED' });
        }
        return { count: data.length };
      }),
      create: vi.fn(async ({ data }: { data: Omit<StoredSession, 'id' | 'status'> }) => {
        const created = { ...data, id: `s${nextId++}`, status: 'SCHEDULED' as const };
        store.set(created.id, created);
        return created;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null),
      // The latest session of the class, cancelled ones included.
      findFirst: vi.fn(async ({ where }: { where: { classId: string } }) =>
        [...store.values()].filter((s) => s.classId === where.classId).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0] ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredSession> }) => Object.assign(store.get(where.id)!, data)),
    },
    classTeacher: {
      findUnique: vi.fn(async ({ where }: { where: { classId_teacherId: { teacherId: string } } }) =>
        teachers.includes(where.classId_teacherId.teacherId) ? { teacherId: where.classId_teacherId.teacherId } : null,
      ),
    },
    attendance: {
      deleteMany: vi.fn(async ({ where }: { where: { classSessionId: string } }) => {
        const removed = attendance.filter((a) => a.classSessionId === where.classSessionId);
        attendance.splice(0, attendance.length, ...attendance.filter((a) => a.classSessionId !== where.classSessionId));
        return { count: removed.length };
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  // The updated class detail comes from ClassesService; here it only echoes the class id.
  const classes = { getDetailById: vi.fn(async (classId: string) => ({ id: classId })) };
  const service = new ClassSessionsService(prisma as unknown as PrismaService, classes as unknown as ClassesService);
  const ordered = () => [...store.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { service, store, ordered, audit, locked, classUpdates, attendance };
}

const SCHEDULE = { startDate: '2026-11-29', weekdays: [2, 4], startTime: '18:00', endTime: '19:30' };
const stored = (id: string, local: string, status: ClassSessionStatus = 'SCHEDULED'): StoredSession => ({
  id,
  classId: 'k',
  title: '',
  startsAt: vn(`${local}T18:00`),
  endsAt: vn(`${local}T19:30`),
  status,
});

// Today is Thursday 26/11/2026 in these tests: "ended" and "in the past" depend on the clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(vn('2026-11-26T09:00'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ClassSessionsService.createSchedule in the past', () => {
  // A class already running may be taken on, but a typo in the year would settle a whole course as taught.
  it('accepts a start up to 30 days back and 400s before that, creating nothing', async () => {
    const ok = setup();
    await expect(ok.service.createSchedule(admin, 'k', { ...SCHEDULE, startDate: '2026-10-27' })).resolves.toEqual({ id: 'k' });
    const typo = setup();
    await expect(typo.service.createSchedule(admin, 'k', { ...SCHEDULE, startDate: '2026-10-26' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(typo.service.createSchedule(admin, 'k', { ...SCHEDULE, startDate: '2025-11-29' })).rejects.toBeInstanceOf(BadRequestException);
    expect(typo.store.size).toBe(0);
  });
});

describe('ClassSessionsService.createSchedule', () => {
  it('makes one session per curriculum part on the chosen weekdays, under the class lock, and audits it', async () => {
    const { service, ordered, audit, locked } = setup();
    await expect(service.createSchedule(admin, 'k', SCHEDULE)).resolves.toEqual({ id: 'k' });
    expect(ordered().map((s) => [s.startsAt, s.endsAt, s.title])).toEqual([
      [vn('2026-12-01T18:00'), vn('2026-12-01T19:30'), ''],
      [vn('2026-12-03T18:00'), vn('2026-12-03T19:30'), ''],
      [vn('2026-12-08T18:00'), vn('2026-12-08T19:30'), ''],
    ]);
    expect(locked).toEqual(['k']);
    expect(audit).toEqual([{ actorId: 'admin', action: 'class.schedule_created', entityType: 'class', entityId: 'k', metadata: { sessions: 3 } }]);
  });

  it('keeps the weekly pattern on the class, so a day off can add a session at the end later', async () => {
    const { service, classUpdates } = setup();
    await service.createSchedule(admin, 'k', SCHEDULE);
    expect(classUpdates).toEqual([{ scheduleWeekdays: [2, 4], scheduleStartTime: '18:00', scheduleEndTime: '19:30' }]);
  });

  it('409s once the class has sessions, for a course without lessons, and for a closed class', async () => {
    await expect(setup({ sessions: [stored('x', '2026-12-01')] }).service.createSchedule(admin, 'k', SCHEDULE)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ curriculum: { chapters: [] } }).service.createSchedule(admin, 'k', SCHEDULE)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ status: 'COMPLETED' }).service.createSchedule(admin, 'k', SCHEDULE)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup().service.createSchedule(admin, 'missing', SCHEDULE)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClassSessionsService.addSession', () => {
  it('adds one session at the given day and times', async () => {
    const { service, ordered, audit } = setup({ sessions: [stored('x', '2026-12-01')] });
    await service.addSession(admin, 'k', { date: '2026-12-15', startTime: '08:00', endTime: '09:30' });
    expect(ordered().at(-1)).toMatchObject({ startsAt: vn('2026-12-15T08:00'), endsAt: vn('2026-12-15T09:30'), status: 'SCHEDULED', title: '' });
    expect(audit.map(({ action }) => action)).toEqual(['class_session.created']);
  });
});

describe('ClassSessionsService.dayOff', () => {
  it('cancels the session and adds one on the next class day after the last session, so the schedule moves back', async () => {
    // Tuesday 01/12 and Thursday 03/12 on a Tuesday/Thursday pattern.
    const { service, store, ordered, audit } = setup({ sessions: [stored('x', '2026-12-01'), stored('y', '2026-12-03')] });
    await service.dayOff(admin, 'x');
    expect(store.get('x')?.status).toBe('CANCELLED');
    const added = ordered().at(-1)!;
    expect(added).toMatchObject({ startsAt: vn('2026-12-08T18:00'), endsAt: vn('2026-12-08T19:30'), status: 'SCHEDULED', title: '' });
    expect(audit).toEqual([{ actorId: 'admin', action: 'class_session.day_off', entityType: 'class_session', entityId: 'x', metadata: { classId: 'k', addedSessionId: added.id, attendanceRemoved: 0 } }]);
  });

  it('puts the new session after the day off when the last session is the one given off', async () => {
    const { service, ordered } = setup({ sessions: [stored('x', '2026-12-01'), stored('y', '2026-12-03')] });
    await service.dayOff(admin, 'y');
    expect(ordered().at(-1)?.startsAt).toEqual(vn('2026-12-08T18:00'));
  });

  it('adds the session a week after the last one, same times, for a class scheduled before patterns were kept', async () => {
    const { service, ordered } = setup({ sessions: [stored('x', '2026-12-01')], pattern: { scheduleWeekdays: [], scheduleStartTime: null as unknown as string, scheduleEndTime: null as unknown as string } });
    await service.dayOff(admin, 'x');
    expect(ordered().at(-1)).toMatchObject({ startsAt: vn('2026-12-08T18:00'), endsAt: vn('2026-12-08T19:30') });
  });

  it('lets a teacher of the class give a day off, but not a teacher of another class', async () => {
    const own = setup({ sessions: [stored('x', '2026-12-01')] });
    await own.service.dayOff(lan, 'x');
    expect(own.store.get('x')?.status).toBe('CANCELLED');
    const other = setup({ sessions: [stored('x', '2026-12-01')] });
    await expect(other.service.dayOff(nam, 'x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(other.store.get('x')?.status).toBe('SCHEDULED');
  });
});

describe('ClassSessionsService day off or move of a session already marked', () => {
  // Attendance opens 15 minutes before the start (agreed 2026-11-26: the marks go with a day off or a move).
  const marks = [
    { classSessionId: 'x', enrollmentId: 'e-an' },
    { classSessionId: 'x', enrollmentId: 'e-minh' },
    { classSessionId: 'y', enrollmentId: 'e-an' },
  ];

  it('removes the marks of a session given off, so they never count in a learner’s attendance, and audits how many', async () => {
    const { service, attendance, audit } = setup({ sessions: [stored('x', '2026-12-01'), stored('y', '2026-12-03')], marks });
    await service.dayOff(lan, 'x');
    expect(attendance).toEqual([{ classSessionId: 'y', enrollmentId: 'e-an' }]);
    expect(audit[0]?.metadata).toMatchObject({ attendanceRemoved: 2 });
  });

  it('removes the marks of a session moved to another time', async () => {
    const { service, attendance, audit } = setup({ sessions: [stored('x', '2026-12-01'), stored('y', '2026-12-03')], marks });
    await service.updateSession(admin, 'x', { date: '2026-12-02', startTime: '17:00', endTime: '18:30' });
    expect(attendance).toEqual([{ classSessionId: 'y', enrollmentId: 'e-an' }]);
    expect(audit[0]?.metadata).toEqual({ classId: 'k', attendanceRemoved: 2 });
  });
});

describe('ClassSessionsService sessions in the past', () => {
  // It would be settled as taught on the next read and could never be undone.
  const PAST = { date: '2025-12-01', startTime: '18:00', endTime: '19:30' };

  it('400s when a session would be added or moved to a time that has already ended', async () => {
    const { service, store } = setup({ sessions: [stored('x', '2026-12-01')] });
    await expect(service.addSession(admin, 'k', PAST)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateSession(admin, 'x', PAST)).rejects.toBeInstanceOf(BadRequestException);
    expect(store.size).toBe(1);
    expect(store.get('x')?.startsAt).toEqual(vn('2026-12-01T18:00'));
  });
});

describe('ClassSessionsService.updateSession / dayOff limits', () => {
  it('moves a scheduled session, locking its class first', async () => {
    const { service, store, locked } = setup({ sessions: [stored('x', '2026-12-01')] });
    await service.updateSession(admin, 'x', { date: '2026-12-02', startTime: '17:00', endTime: '18:30' });
    expect(store.get('x')).toMatchObject({ startsAt: vn('2026-12-02T17:00'), endsAt: vn('2026-12-02T18:30') });
    expect(locked).toEqual(['k']);
  });

  it('409s for a session that has ended, even before it is settled as taught', async () => {
    // Still SCHEDULED in the database, but it ended in 2020.
    const ended = { ...stored('old', '2020-01-06'), startsAt: vn('2020-01-06T18:00'), endsAt: vn('2020-01-06T19:30') };
    const { service, store } = setup({ sessions: [ended] });
    await expect(service.dayOff(admin, 'old')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateSession(admin, 'old', { date: '2026-12-02', startTime: '17:00', endTime: '18:30' })).rejects.toBeInstanceOf(ConflictException);
    expect(store.get('old')?.status).toBe('SCHEDULED');
  });

  it('409s for a session that is not scheduled any more, 404s for an unknown one', async () => {
    const { service } = setup({ sessions: [stored('c', '2026-12-01', 'CANCELLED'), stored('d', '2026-12-03', 'COMPLETED')] });
    const times = { date: '2026-12-02', startTime: '17:00', endTime: '18:30' };
    await expect(service.dayOff(admin, 'c')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateSession(admin, 'c', times)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.dayOff(admin, 'd')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.dayOff(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClassSessionsController', () => {
  const calls: unknown[][] = [];
  const controller = new ClassSessionsController(
    new Proxy({}, { get: () => vi.fn(async (...args: unknown[]) => calls.push(args)) }) as unknown as ClassSessionsService,
  );
  const ID = '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10';

  it('lets only admins change the schedule, and also the class’s teachers give a day off', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ClassSessionsController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, ClassSessionsController.prototype.dayOff)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER']);
  });

  it.each([
    {},
    { ...SCHEDULE, weekdays: [] },
    { ...SCHEDULE, weekdays: [0] },
    { ...SCHEDULE, weekdays: [8] },
    { ...SCHEDULE, weekdays: [2, 2] },
    { ...SCHEDULE, weekdays: [1.5] },
    { ...SCHEDULE, startDate: '29/11/2026' },
    { ...SCHEDULE, startTime: '6:00' },
    { ...SCHEDULE, startTime: '24:00' },
    { ...SCHEDULE, endTime: '18:00' },
    { ...SCHEDULE, endTime: '17:00' },
  ])('rejects schedule %j', (body) => {
    expect(() => controller.createSchedule(admin, ID, body)).toThrow(BadRequestException);
  });

  it('passes a valid schedule and session times through', () => {
    calls.length = 0;
    void controller.createSchedule(admin, ID, SCHEDULE);
    void controller.addSession(admin, ID, { date: '2026-12-15', startTime: '08:00', endTime: '09:30' });
    expect(calls.map((args) => args[2])).toEqual([SCHEDULE, { date: '2026-12-15', startTime: '08:00', endTime: '09:30' }]);
    expect(() => controller.updateSession(admin, ID, { date: '2026-12-15', startTime: '09:30', endTime: '08:00' })).toThrow(BadRequestException);
  });
});
