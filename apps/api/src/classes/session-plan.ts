import type { ClassSessionStatus, ClassStatus, Prisma } from '@center9/database';
import type { PrismaService } from '../prisma.service.js';
import { curriculumParts, planSessions } from './schedule.js';
import type { Part } from './schedule.js';

/** A course's chapters and lessons in position order: what the sessions of its classes teach. */
export const CURRICULUM_SELECT = {
  chapters: {
    orderBy: { position: 'asc' },
    select: { lessons: { orderBy: { position: 'asc' }, select: { id: true, title: true, partCount: true } } },
  },
} satisfies Prisma.CourseSelect;

export interface PlannedSession {
  id: string;
  /** Among the sessions that are not cancelled; null when cancelled. */
  number: number | null;
  startsAt: Date;
  endsAt: Date;
  status: ClassSessionStatus;
  lesson: { id: string; title: string; partNumber: number; partCount: number } | null;
}

/**
 * A class's sessions with the part each one taught (recorded when it was settled) or will teach (the parts not
 * taught yet, in curriculum order: see schedule.ts), and the lesson titles.
 */
async function planClass(db: Prisma.TransactionClient, classId: string, courseId: string) {
  const [rows, course] = await Promise.all([
    db.classSession.findMany({
      where: { classId },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true, status: true, taughtById: true, lessons: { select: { lessonId: true, partNumber: true } } },
    }),
    db.course.findUnique({ where: { id: courseId }, select: CURRICULUM_SELECT }),
  ]);
  const chapters = course?.chapters ?? [];
  const parts = curriculumParts(chapters);
  const plan = planSessions(
    rows.map(({ lessons, ...row }) => ({ ...row, taught: lessons })),
    parts,
  );
  return { plan, parts, titles: new Map(chapters.flatMap(({ lessons }) => lessons.map(({ id, title }) => [id, title]))) };
}

/**
 * Marks every scheduled session that has ended as taught (agreed 2026-11-26: no one has to press a button):
 * records the part it taught in class_session_lessons, so later curriculum edits or cancellations leave it be, and
 * its teacher (the main teacher unless a substitute was set). Runs before every read of a class's schedule, so no
 * job is needed. Opens a transaction only when something is due; the class row lock and a second read stop two
 * requests from settling the same session.
 */
export async function settleSessions(prisma: PrismaService, classId: string, now = new Date()): Promise<void> {
  // A cancelled class settles nothing, so its old sessions must not open a transaction on every read.
  if ((await prisma.classSession.count({ where: { classId, status: 'SCHEDULED', endsAt: { lte: now }, class: { status: { not: 'CANCELLED' } } } })) === 0) {
    return;
  }
  await prisma.$transaction((tx) => settleClass(tx, classId, now));
}

/**
 * Settles the class's ended sessions inside the caller's transaction: locks the class row, then reads again, so two
 * requests never settle the same session.
 */
async function settleClass(tx: Prisma.TransactionClient, classId: string, now: Date): Promise<void> {
  const [row] = await tx.$queryRaw<{ status: ClassStatus; course_id: string }[]>`SELECT status, course_id FROM classes WHERE id = ${classId}::uuid FOR UPDATE`;
  // A cancelled class taught nothing more.
  if (!row || row.status === 'CANCELLED') {
    return;
  }
  const { plan } = await planClass(tx, classId, row.course_id);
  const due = plan.sessions.filter((session) => session.status === 'SCHEDULED' && session.endsAt <= now);
  if (due.length === 0) {
    return;
  }
  const main = await tx.classTeacher.findFirst({ where: { classId, roleInClass: 'MAIN_TEACHER' }, select: { teacherId: true } });
  for (const session of due) {
    await tx.classSession.update({ where: { id: session.id }, data: { status: 'COMPLETED', taughtById: session.taughtById ?? main?.teacherId ?? null } });
    if (session.part) {
      await tx.classSessionLesson.create({ data: { classSessionId: session.id, lessonId: session.part.lessonId, partNumber: session.part.partNumber } });
    }
  }
  // A null actor means the system.
  await tx.auditLog.create({ data: { actorId: null, action: 'class.sessions_settled', entityType: 'class', entityId: classId, metadata: { sessions: due.length } } });
}

/**
 * Settles the ended sessions of every class of a course, in the caller's transaction. For a curriculum write, under
 * the course lock and before its checks: a session that ended but was not settled yet (nobody opened the class)
 * would otherwise take its part from the edited curriculum, and the guards would not see what it taught.
 */
export async function settleCourse(tx: Prisma.TransactionClient, courseId: string, now = new Date()): Promise<void> {
  const due = await tx.classSession.findMany({
    where: { status: 'SCHEDULED', endsAt: { lte: now }, class: { courseId, status: { not: 'CANCELLED' } } },
    distinct: ['classId'],
    select: { classId: true },
  });
  for (const { classId } of due) {
    await settleClass(tx, classId, now);
  }
}

/**
 * A class's sessions in time order, each with the curriculum part it taught or will teach, after settling the ones
 * that have ended. Shared by the staff and the learner views.
 */
export async function loadSessions(
  prisma: PrismaService,
  classId: string,
  courseId: string,
  now = new Date(),
): Promise<{ sessions: PlannedSession[]; totalParts: number; missingSessions: number }> {
  await settleSessions(prisma, classId, now);
  const { plan, parts, titles } = await planClass(prisma, classId, courseId);
  let number = 0;
  return {
    sessions: plan.sessions.map(({ id, startsAt, endsAt, status, part }) => ({
      id,
      number: status === 'CANCELLED' ? null : ++number,
      startsAt,
      endsAt,
      status,
      lesson: part && toLesson(part, titles),
    })),
    totalParts: parts.length,
    missingSessions: plan.missing,
  };
}

const toLesson = (part: Part, titles: Map<string, string>) => ({ id: part.lessonId, title: titles.get(part.lessonId) ?? '', partNumber: part.partNumber, partCount: part.partCount });
