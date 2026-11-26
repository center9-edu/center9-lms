import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import type { AttendanceInput, AttendanceSheetDto } from './classes.dto.js';
import { classVisibleTo, isClassTeacher, lockOpenClass } from './classes.service.js';
import { settleSessions } from './session-plan.js';

/** Agreed 2026-11-26: attendance opens 15 minutes before the session starts, and stays open to corrections. */
const OPENS_BEFORE_MS = 15 * 60_000;

const SESSION_SELECT = {
  id: true,
  classId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  class: { select: { code: true, status: true } },
  taughtBy: { select: { userId: true, user: { select: { fullName: true } } } },
} satisfies Prisma.ClassSessionSelect;

type SessionRow = Prisma.ClassSessionGetPayload<{ select: typeof SESSION_SELECT }>;

const opensAt = (session: { startsAt: Date }) => new Date(session.startsAt.getTime() - OPENS_BEFORE_MS);

/**
 * The students on a session's sheet: active ones who had enrolled by its end (a late joiner is not on older
 * sheets), and anyone already marked there (say, who dropped out later).
 */
const roster = (db: Prisma.TransactionClient, session: { id: string; classId: string; endsAt: Date }) =>
  db.classEnrollment.findMany({
    where: { classId: session.classId, OR: [{ status: 'ACTIVE', enrolledAt: { lte: session.endsAt } }, { attendance: { some: { classSessionId: session.id } } }] },
    select: {
      id: true,
      status: true,
      student: { select: { studentCode: true, user: { select: { fullName: true } } } },
      attendance: { where: { classSessionId: session.id }, select: { status: true, note: true } },
    },
    orderBy: { student: { user: { fullName: 'asc' } } },
  });

/**
 * Attendance per session (agreed 2026-11-26): the class's own teachers (main or assistant) mark it from 15 minutes
 * before the start and can correct it later; staff read it; admins do not mark.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** `now` decides whether marking is open; a parameter so tests can pick the moment. */
  async get(actor: AuthContext, sessionId: string, now = new Date()): Promise<AttendanceSheetDto> {
    const found = await this.prisma.classSession.findUnique({ where: { id: sessionId }, select: { classId: true } });
    // A class the actor may not see is the same 404 as an unknown session.
    if (!found || !(await this.prisma.class.findFirst({ where: { id: found.classId, ...classVisibleTo(actor) }, select: { id: true } }))) {
      throw new NotFoundException();
    }
    // An ended session shows as taught.
    await settleSessions(this.prisma, found.classId, now);
    const session = (await this.prisma.classSession.findUnique({ where: { id: sessionId }, select: SESSION_SELECT }))!;
    const editable = (await isClassTeacher(this.prisma, session.classId, actor.user.id)) && this.isOpen(session, now);
    const [students, teacherOptions] = await Promise.all([
      roster(this.prisma, session),
      editable
        ? this.prisma.teacherProfile.findMany({
            where: { user: { status: 'ACTIVE' } },
            select: { userId: true, teacherCode: true, user: { select: { fullName: true } } },
            orderBy: { teacherCode: 'asc' },
          })
        : [],
    ]);
    return {
      sessionId: session.id,
      classCode: session.class.code,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      status: session.status,
      opensAt: opensAt(session).toISOString(),
      editable,
      taughtBy: session.taughtBy && { userId: session.taughtBy.userId, fullName: session.taughtBy.user.fullName },
      teacherOptions: teacherOptions.map(({ userId, teacherCode, user }) => ({ userId, teacherCode, fullName: user.fullName })),
      students: students.map(({ id, status, student, attendance }) => ({
        enrollmentId: id,
        studentCode: student.studentCode,
        fullName: student.user.fullName,
        enrollmentStatus: status,
        status: attendance[0]?.status ?? null,
        note: attendance[0]?.note ?? null,
      })),
    };
  }

  /** Saves the listed marks (a correction replaces the earlier mark) and, optionally, who really taught. */
  async save(actor: AuthContext, sessionId: string, input: AttendanceInput, now = new Date()): Promise<AttendanceSheetDto> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.classSession.findUnique({ where: { id: sessionId }, select: { classId: true } });
      if (!found) {
        throw new NotFoundException();
      }
      if (!(await isClassTeacher(tx, found.classId, actor.user.id))) {
        throw new ForbiddenException('Only a teacher of this class can mark attendance');
      }
      await lockOpenClass(tx, found.classId);
      // Read again under the lock: the session may have been given off meanwhile.
      const session = (await tx.classSession.findUnique({ where: { id: sessionId }, select: SESSION_SELECT }))!;
      if (session.status === 'CANCELLED') {
        throw new ConflictException('The session was cancelled');
      }
      if (now < opensAt(session)) {
        throw new ConflictException(`Attendance opens at ${opensAt(session).toISOString()}`);
      }
      const ids = input.records.map(({ enrollmentId }) => enrollmentId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('Each student can be listed once');
      }
      const onSheet = new Set((await roster(tx, session)).map(({ id }) => id));
      if (!ids.every((id) => onSheet.has(id))) {
        throw new BadRequestException('Every record must be a student on this session’s sheet');
      }
      if (input.taughtBy !== undefined) {
        const teacher = await tx.teacherProfile.findUnique({ where: { userId: input.taughtBy }, select: { user: { select: { status: true } } } });
        if (!teacher) {
          throw new NotFoundException('Teacher profile not found');
        }
        if (teacher.user.status !== 'ACTIVE') {
          throw new ConflictException('The teacher account is not active');
        }
        await tx.classSession.update({ where: { id: sessionId }, data: { taughtById: input.taughtBy } });
      }
      for (const { enrollmentId, status, note } of input.records) {
        await tx.attendance.upsert({
          where: { classSessionId_enrollmentId: { classSessionId: sessionId, enrollmentId } },
          create: { classId: session.classId, classSessionId: sessionId, enrollmentId, status, note, markedById: actor.user.id },
          update: { status, note, markedById: actor.user.id, markedAt: now },
        });
      }
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'attendance.saved', entityType: 'class_session', entityId: sessionId, metadata: { classId: session.classId, records: input.records.length } },
      });
    });
    return this.get(actor, sessionId, now);
  }

  private isOpen(session: SessionRow, now: Date): boolean {
    return session.status !== 'CANCELLED' && session.class.status !== 'COMPLETED' && session.class.status !== 'CANCELLED' && now >= opensAt(session);
  }
}
