import type { ClassSessionStatus, ClassStatus } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service.js';
import { loadSessions, settleCourse, settleSessions } from './session-plan.js';

const vn = (local: string) => new Date(`${local}+07:00`);

interface StoredSession {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: ClassSessionStatus;
  taughtById: string | null;
}

// Lesson A has 2 parts, lesson B 1.
const CURRICULUM = { chapters: [{ lessons: [{ id: 'A', title: 'Biến', partCount: 2 }, { id: 'B', title: 'Vòng lặp', partCount: 1 }] }] };
const at = (id: string, day: string, status: ClassSessionStatus = 'SCHEDULED', taughtById: string | null = null): StoredSession => ({
  id,
  startsAt: vn(`${day}T18:00`),
  endsAt: vn(`${day}T19:30`),
  status,
  taughtById,
});

function setup({ sessions = [] as StoredSession[], links = [] as { classSessionId: string; lessonId: string; partNumber: number }[], classStatus = 'IN_PROGRESS' as ClassStatus } = {}) {
  const store = new Map(sessions.map((s) => [s.id, { ...s }]));
  const lessonLinks = [...links];
  const audit: { actorId: string | null; action: string; entityId: string; metadata?: unknown }[] = [];
  const transactions: string[] = [];
  const prisma = {
    // The class row lock: SELECT status, course_id … FOR UPDATE.
    $queryRaw: vi.fn(async () => [{ status: classStatus, course_id: 'c-py' }]),
    course: { findUnique: vi.fn(async () => CURRICULUM) },
    classTeacher: { findFirst: vi.fn(async () => ({ teacherId: 'gv-lan' })) },
    classSession: {
      count: vi.fn(async ({ where }: { where: { status: ClassSessionStatus; endsAt: { lte: Date }; class?: { status: { not: ClassStatus } } } }) =>
        where.class && classStatus === where.class.status.not ? 0 : [...store.values()].filter((s) => s.status === where.status && s.endsAt <= where.endsAt.lte).length,
      ),
      findMany: vi.fn(async (args?: { distinct?: string[]; where: { endsAt?: { lte: Date } } }) =>
        args?.distinct
          ? // The course's classes with a session due: only class k here.
            [...store.values()].some((s) => s.status === 'SCHEDULED' && s.endsAt <= args.where.endsAt!.lte) ? [{ classId: 'k' }] : []
          : [...store.values()]
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
          .map((s) => ({ ...s, lessons: lessonLinks.filter((l) => l.classSessionId === s.id).map(({ lessonId, partNumber }) => ({ lessonId, partNumber })) })),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredSession> }) => Object.assign(store.get(where.id)!, data)),
    },
    classSessionLesson: { create: vi.fn(async ({ data }: { data: (typeof lessonLinks)[number] }) => lessonLinks.push(data)) },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      transactions.push('tx');
      return fn(prisma);
    }),
  };
  return { prisma: prisma as unknown as PrismaService, store, lessonLinks, audit, transactions };
}

// Thursday 03/12 at 20:00: s1 (01/12) and s2 (03/12, ended 19:30) are over; s3 (08/12) is not.
const NOW = vn('2026-12-03T20:00');

describe('settleSessions', () => {
  it('marks ended sessions taught, records the part each taught and the main teacher, and audits it as the system', async () => {
    const { prisma, store, lessonLinks, audit } = setup({ sessions: [at('s1', '2026-12-01'), at('s2', '2026-12-03'), at('s3', '2026-12-08')] });
    await settleSessions(prisma, 'k', NOW);
    expect([...store.values()].map(({ id, status, taughtById }) => [id, status, taughtById])).toEqual([
      ['s1', 'COMPLETED', 'gv-lan'],
      ['s2', 'COMPLETED', 'gv-lan'],
      ['s3', 'SCHEDULED', null],
    ]);
    expect(lessonLinks).toEqual([
      { classSessionId: 's1', lessonId: 'A', partNumber: 1 },
      { classSessionId: 's2', lessonId: 'A', partNumber: 2 },
    ]);
    expect(audit).toEqual([{ actorId: null, action: 'class.sessions_settled', entityType: 'class', entityId: 'k', metadata: { sessions: 2 } }]);
  });

  it('waits for the end of the session, not its start', async () => {
    const { prisma, store } = setup({ sessions: [at('s2', '2026-12-03')] });
    await settleSessions(prisma, 'k', vn('2026-12-03T19:29'));
    expect(store.get('s2')?.status).toBe('SCHEDULED');
    await settleSessions(prisma, 'k', vn('2026-12-03T19:30'));
    expect(store.get('s2')?.status).toBe('COMPLETED');
  });

  it('opens no transaction when nothing is due, and settles nothing twice', async () => {
    const { prisma, lessonLinks, transactions } = setup({ sessions: [at('s1', '2026-12-01'), at('s3', '2026-12-08')] });
    await settleSessions(prisma, 'k', NOW);
    await settleSessions(prisma, 'k', NOW);
    expect(transactions).toEqual(['tx']);
    expect(lessonLinks).toHaveLength(1);
  });

  it('keeps a substitute already recorded, and skips cancelled sessions', async () => {
    const { prisma, store, lessonLinks } = setup({ sessions: [at('s1', '2026-12-01', 'SCHEDULED', 'gv-nam'), at('x', '2026-12-02', 'CANCELLED'), at('s2', '2026-12-03')] });
    await settleSessions(prisma, 'k', NOW);
    expect(store.get('s1')?.taughtById).toBe('gv-nam');
    expect(store.get('x')?.status).toBe('CANCELLED');
    expect(lessonLinks.map(({ classSessionId, lessonId, partNumber }) => `${classSessionId}:${lessonId}${partNumber}`)).toEqual(['s1:A1', 's2:A2']);
  });

  it('continues after what was already taught', async () => {
    const { prisma, lessonLinks } = setup({
      sessions: [at('s1', '2026-12-01', 'COMPLETED', 'gv-lan'), at('s2', '2026-12-03')],
      links: [{ classSessionId: 's1', lessonId: 'A', partNumber: 1 }],
    });
    await settleSessions(prisma, 'k', NOW);
    expect(lessonLinks.at(-1)).toEqual({ classSessionId: 's2', lessonId: 'A', partNumber: 2 });
  });

  it('settles nothing in a cancelled class, and does not even lock it on every read', async () => {
    const { prisma, store, transactions } = setup({ sessions: [at('s1', '2026-12-01')], classStatus: 'CANCELLED' });
    await settleSessions(prisma, 'k', NOW);
    expect(store.get('s1')?.status).toBe('SCHEDULED');
    expect(transactions).toEqual([]);
  });
});

describe('settleCourse', () => {
  it('settles every class of the course that has a session due, in the caller’s transaction', async () => {
    const { prisma, lessonLinks, transactions } = setup({ sessions: [at('s1', '2026-12-01'), at('s3', '2026-12-08')] });
    await settleCourse(prisma, 'c-py', NOW);
    expect(lessonLinks).toEqual([{ classSessionId: 's1', lessonId: 'A', partNumber: 1 }]);
    expect(transactions).toEqual([]);
  });
});

describe('loadSessions', () => {
  it('settles first, then shows what each session taught or will teach', async () => {
    const { prisma } = setup({ sessions: [at('s1', '2026-12-01'), at('s3', '2026-12-08')] });
    const { sessions, totalParts, missingSessions } = await loadSessions(prisma, 'k', 'c-py', NOW);
    expect(sessions.map(({ id, status, lesson }) => `${id}:${status}:${lesson?.id}${lesson?.partNumber}`)).toEqual(['s1:COMPLETED:A1', 's3:SCHEDULED:A2']);
    expect([totalParts, missingSessions]).toEqual([3, 1]);
  });
});
