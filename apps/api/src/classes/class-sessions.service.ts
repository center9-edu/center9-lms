import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import type { ClassDetailDto, ScheduleInput, SessionTimesInput } from './classes.dto.js';
import { ClassesService, lockOpenClass, teachesOrRuns } from './classes.service.js';
import { CURRICULUM_SELECT, settleCourse } from './session-plan.js';
import { curriculumParts, nextWeeklySlot, vietnamDay, vietnamTime, weeklySessions } from './schedule.js';

const MAX_PAST_START_DAYS = 30;

/**
 * The session times in Vietnam, refused if they have already ended: the next read would settle such a session as
 * taught for good (a typo in the year would do it). A schedule may still start in the past, to take on a running class.
 */
function futureTimes(input: SessionTimesInput): { startsAt: Date; endsAt: Date } {
  const times = { startsAt: vietnamTime(input.date, input.startTime), endsAt: vietnamTime(input.date, input.endTime) };
  if (times.endsAt <= new Date()) {
    throw new BadRequestException('A session cannot be added or moved to a time that has already ended');
  }
  return times;
}

/**
 * A class's sessions: made from a weekly schedule, then moved, cancelled or added one by one. Which part each
 * session teaches is not stored (see schedule.ts). Every write locks the class row first; each returns the class.
 */
@Injectable()
export class ClassSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassesService,
  ) {}

  /** One session per curriculum part, on the chosen weekdays; only for a class that has no sessions yet. */
  async createSchedule(actor: AuthContext, classId: string, input: ScheduleInput): Promise<ClassDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOpenClass(tx, classId);
      // Up to 30 days back (agreed 2026-11-26), to take on a class already running: ended sessions are settled as
      // taught on the next read for good, so a typo in the year must not reach that far.
      if (input.startDate < vietnamDay(new Date(Date.now() - MAX_PAST_START_DAYS * 86_400_000))) {
        throw new BadRequestException(`A schedule can start at most ${MAX_PAST_START_DAYS} days ago`);
      }
      if ((await tx.classSession.count({ where: { classId } })) > 0) {
        throw new ConflictException('The class already has sessions; add, move or cancel them one by one');
      }
      const row = await tx.class.findUnique({ where: { id: classId }, select: { course: { select: CURRICULUM_SELECT } } });
      const parts = curriculumParts(row?.course.chapters ?? []);
      if (parts.length === 0) {
        throw new ConflictException('The course has no lessons yet');
      }
      const sessions = weeklySessions({ ...input, count: parts.length });
      // title is an optional label: a session's number and lesson are worked out on every read.
      await tx.classSession.createMany({ data: sessions.map((times) => ({ classId, title: '', ...times })) });
      // Kept so a day off can add a session at the end on the same pattern.
      await tx.class.update({
        where: { id: classId },
        data: { scheduleWeekdays: input.weekdays, scheduleStartTime: input.startTime, scheduleEndTime: input.endTime },
      });
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'class.schedule_created', entityType: 'class', entityId: classId, metadata: { sessions: sessions.length } } });
    });
    return this.classes.getDetailById(classId);
  }

  /** Adds one session, for instance when the curriculum grew or a session was cancelled. */
  async addSession(actor: AuthContext, classId: string, input: SessionTimesInput): Promise<ClassDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOpenClass(tx, classId);
      const session = await tx.classSession.create({ data: { classId, title: '', ...futureTimes(input) } });
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'class_session.created', entityType: 'class_session', entityId: session.id, metadata: { classId } } });
    });
    return this.classes.getDetailById(classId);
  }

  async updateSession(actor: AuthContext, sessionId: string, input: SessionTimesInput): Promise<ClassDetailDto> {
    const classId = await this.prisma.$transaction(async (tx) => {
      const classId = await this.lockScheduledSession(tx, sessionId);
      await tx.classSession.update({ where: { id: sessionId }, data: futureTimes(input) });
      // Marks taken from 15 minutes before the old start belong to a session that did not happen then.
      const { count } = await tx.attendance.deleteMany({ where: { classSessionId: sessionId } });
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'class_session.updated', entityType: 'class_session', entityId: sessionId, metadata: { classId, attendanceRemoved: count } },
      });
      return classId;
    });
    return this.classes.getDetailById(classId);
  }

  /**
   * A day off (agreed 2026-11-26): the session is cancelled and one is added on the next class day of the weekly
   * pattern after the latest session, so the schedule moves back and the course keeps all its sessions. For admins
   * and the class's own teachers.
   */
  async dayOff(actor: AuthContext, sessionId: string): Promise<ClassDetailDto> {
    const classId = await this.prisma.$transaction(async (tx) => {
      const found = await tx.classSession.findUnique({ where: { id: sessionId }, select: { classId: true } });
      if (!found) {
        throw new NotFoundException();
      }
      if (!(await teachesOrRuns(tx, actor, found.classId))) {
        throw new ForbiddenException('Only an admin or a teacher of this class can give a day off');
      }
      const classId = await this.lockScheduledSession(tx, sessionId);
      await tx.classSession.update({ where: { id: sessionId }, data: { status: 'CANCELLED' } });
      // Marks already taken (attendance opens 15 minutes early) go too: a cancelled session counts for no one.
      const { count } = await tx.attendance.deleteMany({ where: { classSessionId: sessionId } });
      // The latest session, cancelled ones included: giving the last session off must not add one on that same day.
      const last = await tx.classSession.findFirst({ where: { classId }, orderBy: { startsAt: 'desc' }, select: { startsAt: true, endsAt: true } });
      const pattern = await tx.class.findUnique({ where: { id: classId }, select: { scheduleWeekdays: true, scheduleStartTime: true, scheduleEndTime: true } });
      const slot = nextWeeklySlot(
        { weekdays: pattern?.scheduleWeekdays ?? [], startTime: pattern?.scheduleStartTime ?? null, endTime: pattern?.scheduleEndTime ?? null },
        last ?? { startsAt: new Date(), endsAt: new Date() },
      );
      const added = await tx.classSession.create({ data: { classId, title: '', ...slot } });
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'class_session.day_off', entityType: 'class_session', entityId: sessionId, metadata: { classId, addedSessionId: added.id, attendanceRemoved: count } },
      });
      return classId;
    });
    return this.classes.getDetailById(classId);
  }

  /** Locks the session's class, then reads the session again (it may have changed while we waited); 409 unless SCHEDULED. */
  /**
   * For the curriculum, under its course lock and before its checks: settles the ended sessions of the course's
   * classes, so an edit never changes what one of them taught.
   */
  settleCourse(tx: Prisma.TransactionClient, courseId: string): Promise<void> {
    return settleCourse(tx, courseId);
  }

  private async lockScheduledSession(tx: Prisma.TransactionClient, sessionId: string): Promise<string> {
    const found = await tx.classSession.findUnique({ where: { id: sessionId } });
    if (!found) {
      throw new NotFoundException();
    }
    await lockOpenClass(tx, found.classId);
    const session = await tx.classSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException();
    }
    // An ended session is taught even before it is settled (settling waits for the next read of the schedule).
    if (session.status !== 'SCHEDULED' || session.endsAt <= new Date()) {
      throw new ConflictException('Only a session that has not ended can change');
    }
    return session.classId;
  }
}
