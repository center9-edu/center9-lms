import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClassStatus, ClassTeacherRole, Prisma, Role } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import { nextProfileCode, retryOnUniqueConflict } from '../profile-code.js';
import type { ClassDetailDto, ClassDto, CreateClassInput, UpdateClassInput } from './classes.dto.js';
import { loadSessions } from './session-plan.js';

// ponytail: one page is enough for one center; add paging when classes outgrow it.
const MAX_LISTED_CLASSES = 1_000;

/** Roles that see every class; anyone else (teachers) sees only the classes they teach. */
const SEES_ALL: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES'];

/** Forward only; any class not finished can be cancelled. Nothing leaves COMPLETED or CANCELLED. */
const NEXT_STATUSES: Record<ClassStatus, ClassStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const CLASS_INCLUDE = {
  course: { select: { id: true, title: true, slug: true } },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
  // MAIN_TEACHER is declared first in the enum, so it sorts first.
  teachers: {
    orderBy: [{ roleInClass: 'asc' }, { assignedAt: 'asc' }],
    select: { roleInClass: true, teacher: { select: { userId: true, teacherCode: true, user: { select: { fullName: true } } } } },
  },
} satisfies Prisma.ClassInclude;

type ClassWithRelations = Prisma.ClassGetPayload<{ include: typeof CLASS_INCLUDE }>;


const toDate = (value: string | null) => (value === null ? null : new Date(value));
const fromDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

/** Every class for staff; only the classes they teach for anyone else (teachers). */
export function classVisibleTo(actor: AuthContext): Prisma.ClassWhereInput {
  return actor.user.roles.some((role) => SEES_ALL.includes(role)) ? {} : { teachers: { some: { teacherId: actor.user.id } } };
}

/** Roles that run every class: create it, schedule it, assign teachers. */
export const CLASS_ADMINS: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN'];

/**
 * An admin, or a teacher (main or assistant) of this very class. Seeing a class is not enough: a teacher who is
 * also sales sees every class but teaches only some.
 */
export async function teachesOrRuns(db: Prisma.TransactionClient, actor: AuthContext, classId: string): Promise<boolean> {
  return actor.user.roles.some((role) => CLASS_ADMINS.includes(role)) || isClassTeacher(db, classId, actor.user.id);
}

/** A main teacher or an assistant of this class. */
export async function isClassTeacher(db: Prisma.TransactionClient, classId: string, userId: string): Promise<boolean> {
  return (await db.classTeacher.findUnique({ where: { classId_teacherId: { classId, teacherId: userId } }, select: { teacherId: true } })) !== null;
}

/**
 * Locks the class row until the transaction ends, so changes to its teachers or students run one after
 * the other (a seat count stays true until the insert); 409 once the class is finished or cancelled.
 */
export async function lockOpenClass(tx: Prisma.TransactionClient, classId: string): Promise<{ status: ClassStatus; capacity: number | null }> {
  const [row] = await tx.$queryRaw<{ status: ClassStatus; capacity: number | null }[]>`SELECT status, capacity FROM classes WHERE id = ${classId}::uuid FOR UPDATE`;
  if (!row) {
    throw new NotFoundException();
  }
  if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
    throw new ConflictException('A finished or cancelled class cannot change');
  }
  return row;
}

function toDto(row: ClassWithRelations): ClassDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    course: { id: row.course.id, title: row.course.title, slug: row.course.slug },
    startDate: fromDate(row.startDate),
    endDate: fromDate(row.endDate),
    capacity: row.capacity,
    activeStudentCount: row._count.enrollments,
    nextStatuses: NEXT_STATUSES[row.status],
    teachers: row.teachers.map(({ roleInClass, teacher }) => ({
      userId: teacher.userId,
      teacherCode: teacher.teacherCode,
      fullName: teacher.user.fullName,
      role: roleInClass,
    })),
  };
}

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthContext): Promise<ClassDto[]> {
    const rows = await this.prisma.class.findMany({ where: classVisibleTo(actor), include: CLASS_INCLUDE, orderBy: { code: 'asc' }, take: MAX_LISTED_CLASSES });
    return rows.map(toDto);
  }

  /** 404 for a class outside what the actor may see, so its existence does not leak. */
  async getByCode(actor: AuthContext, code: string): Promise<ClassDetailDto> {
    const row = await this.prisma.class.findFirst({ where: { code, ...classVisibleTo(actor) }, include: CLASS_INCLUDE });
    if (!row) {
      throw new NotFoundException();
    }
    return this.withSessions(row);
  }

  /** The detail without a visibility check: only for answering a write the caller was already allowed to make. */
  async getDetailById(classId: string): Promise<ClassDetailDto> {
    return this.withSessions(await this.find(this.prisma, classId));
  }

  async create(actor: AuthContext, input: CreateClassInput): Promise<ClassDto> {
    const course = await this.prisma.course.findUnique({ where: { id: input.courseId }, select: { archivedAt: true } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.archivedAt) {
      throw new ConflictException('The course is archived');
    }
    // Two classes created at once can pick the same code; the loser's retry takes the next one.
    return retryOnUniqueConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const code = await nextProfileCode(tx, 'LH');
        const row = await tx.class.create({
          data: { code, courseId: input.courseId, name: input.name, startDate: toDate(input.startDate), endDate: toDate(input.endDate), capacity: input.capacity },
          include: CLASS_INCLUDE,
        });
        await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'class.created', entityType: 'class', entityId: row.id, metadata: { code, courseId: input.courseId } } });
        return toDto(row);
      }),
    );
  }

  async update(actor: AuthContext, classId: string, input: UpdateClassInput): Promise<ClassDto> {
    return this.prisma.$transaction(async (tx) => {
      // Locked like an enrollment, so the seat count below holds until the update (and a closed class is a 409).
      await lockOpenClass(tx, classId);
      const current = await this.find(tx, classId);
      if (input.capacity !== null && input.capacity < current._count.enrollments) {
        throw new ConflictException('The class already has more active students than this capacity');
      }
      const row = await tx.class.update({
        where: { id: classId },
        data: { name: input.name, startDate: toDate(input.startDate), endDate: toDate(input.endDate), capacity: input.capacity },
        include: CLASS_INCLUDE,
      });
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'class.updated', entityType: 'class', entityId: classId } });
      return toDto(row);
    });
  }

  async setStatus(actor: AuthContext, classId: string, status: ClassStatus): Promise<ClassDto> {
    return this.prisma.$transaction(async (tx) => {
      // Two admins at once must not both pass the check below; a finished or cancelled class is a 409 here already.
      await lockOpenClass(tx, classId);
      const current = await this.find(tx, classId);
      if (!NEXT_STATUSES[current.status].includes(status)) {
        throw new ConflictException(`A ${current.status} class cannot become ${status}`);
      }
      // A class ended early (agreed 2026-11-26) cancels its sessions not started yet, with any marks taken early, so
      // none is later settled as taught. One under way stays and is settled when it ends.
      let sessionsCancelled = 0;
      if (status === 'COMPLETED') {
        const notStarted = { classId, status: 'SCHEDULED' as const, startsAt: { gt: new Date() } };
        await tx.attendance.deleteMany({ where: { classSession: notStarted } });
        ({ count: sessionsCancelled } = await tx.classSession.updateMany({ where: notStarted, data: { status: 'CANCELLED' } }));
      }
      const row = await tx.class.update({ where: { id: classId }, data: { status }, include: CLASS_INCLUDE });
      await tx.auditLog.create({
        data: {
          actorId: actor.user.id,
          action: 'class.status_changed',
          entityType: 'class',
          entityId: classId,
          metadata: { from: current.status, to: status, ...(status === 'COMPLETED' && { sessionsCancelled }) },
        },
      });
      return toDto(row);
    });
  }

  /** Adds the teacher or changes their role; a new main teacher turns the current one into an assistant. */
  async assignTeacher(actor: AuthContext, classId: string, teacherId: string, role: ClassTeacherRole): Promise<ClassDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockOpenClass(tx, classId);
      const profile = await tx.teacherProfile.findUnique({ where: { userId: teacherId }, select: { user: { select: { status: true } } } });
      if (!profile) {
        throw new NotFoundException('Teacher profile not found');
      }
      if (profile.user.status !== 'ACTIVE') {
        throw new ConflictException('The teacher account is not active');
      }
      if (role === 'MAIN_TEACHER') {
        await tx.classTeacher.updateMany({ where: { classId, roleInClass: 'MAIN_TEACHER', teacherId: { not: teacherId } }, data: { roleInClass: 'ASSISTANT' } });
      }
      await tx.classTeacher.upsert({
        where: { classId_teacherId: { classId, teacherId } },
        create: { classId, teacherId, roleInClass: role },
        update: { roleInClass: role },
      });
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'class.teacher_assigned', entityType: 'class', entityId: classId, metadata: { teacherId, role } } });
      return toDto(await this.find(tx, classId));
    });
  }

  async removeTeacher(actor: AuthContext, classId: string, teacherId: string): Promise<ClassDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockOpenClass(tx, classId);
      if ((await tx.classTeacher.deleteMany({ where: { classId, teacherId } })).count === 0) {
        throw new NotFoundException('The teacher is not in this class');
      }
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'class.teacher_removed', entityType: 'class', entityId: classId, metadata: { teacherId } } });
      return toDto(await this.find(tx, classId));
    });
  }

  private async withSessions(row: ClassWithRelations): Promise<ClassDetailDto> {
    const { sessions, totalParts, missingSessions } = await loadSessions(this.prisma, row.id, row.course.id);
    return {
      ...toDto(row),
      sessions: sessions.map(({ startsAt, endsAt, ...session }) => ({ ...session, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })),
      totalParts,
      missingSessions,
    };
  }

  private async find(tx: Prisma.TransactionClient, classId: string): Promise<ClassWithRelations> {
    const row = await tx.class.findUnique({ where: { id: classId }, include: CLASS_INCLUDE });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }
}
