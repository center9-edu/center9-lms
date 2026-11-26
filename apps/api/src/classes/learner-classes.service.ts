import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import type { LearnerClassDetailDto, LearnerClassDto } from './classes.dto.js';
import { loadSessions } from './session-plan.js';
import type { PlannedSession } from './session-plan.js';
import { unlockedLessons } from './schedule.js';

// Agreed 2026-11-26: learners read lessons as PDF only; Word files are teachers' material such as lesson plans.
// Kept here rather than imported, since lesson-files is another feature module.
const PDF_TYPE = 'application/pdf';

/**
 * The enrollments that let this user see a class: their own (a student) or their children's (a parent, through
 * the guardian linked to their account), while studying or after finishing. Dropped or removed students lose access.
 */
export function learnerEnrollments(actor: AuthContext): Prisma.ClassEnrollmentWhereInput {
  const mine: Prisma.ClassEnrollmentWhereInput[] = [];
  if (actor.user.roles.includes('STUDENT')) {
    mine.push({ studentId: actor.user.id });
  }
  if (actor.user.roles.includes('PARENT')) {
    mine.push({ student: { guardians: { some: { guardian: { userId: actor.user.id } } } } });
  }
  // An empty OR matches nothing: without either role there is nothing to see.
  return { status: { in: ['ACTIVE', 'COMPLETED'] }, OR: mine };
}

/** Classes a learner may see: one of their enrollments, and the class neither a draft nor cancelled. */
export function learnerClasses(actor: AuthContext): Prisma.ClassWhereInput {
  return { status: { notIn: ['DRAFT', 'CANCELLED'] }, enrollments: { some: learnerEnrollments(actor) } };
}

const learnerSelect = (actor: AuthContext) =>
  ({
    id: true,
    code: true,
    name: true,
    status: true,
    startDate: true,
    endDate: true,
    course: { select: { id: true, title: true } },
    teachers: { orderBy: [{ roleInClass: 'asc' }, { assignedAt: 'asc' }], select: { roleInClass: true, teacher: { select: { user: { select: { fullName: true } } } } } },
    // Only the learner's own enrollment, or the parent's children: never classmates. Their marks come with them,
    // without the teacher's notes.
    enrollments: {
      where: learnerEnrollments(actor),
      select: { student: { select: { user: { select: { fullName: true } } } }, attendance: { select: { classSessionId: true, status: true } } },
    },
  }) satisfies Prisma.ClassSelect;

type LearnerRow = Prisma.ClassGetPayload<{ select: ReturnType<typeof learnerSelect> }>;

/** A loaded session in the shape unlockedLessons reads. */
const toPlanned = ({ startsAt, lesson }: PlannedSession) => ({
  startsAt,
  part: lesson && { lessonId: lesson.id, partNumber: lesson.partNumber, partCount: lesson.partCount },
});

const fromDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

function toDto(row: LearnerRow): LearnerClassDto {
  return {
    code: row.code,
    name: row.name,
    status: row.status,
    courseTitle: row.course.title,
    startDate: fromDate(row.startDate),
    endDate: fromDate(row.endDate),
    teachers: row.teachers.map(({ roleInClass, teacher }) => ({ fullName: teacher.user.fullName, role: roleInClass })),
    students: row.enrollments.map(({ student }) => student.user.fullName),
  };
}

/** Classes for students and parents. Anything outside their own classes is a 404, the same as an unknown code. */
@Injectable()
export class LearnerClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthContext): Promise<LearnerClassDto[]> {
    const rows = await this.prisma.class.findMany({ where: learnerClasses(actor), select: learnerSelect(actor), orderBy: { code: 'asc' } });
    return rows.map(toDto);
  }

  /**
   * Whether the lesson is open today in one of the learner's classes; used before a learner gets a lesson file.
   * Exported through ClassesModule, so lesson-files asks here instead of repeating the rule.
   */
  async canOpenLesson(actor: AuthContext, lessonId: string, now = new Date()): Promise<boolean> {
    const classes = await this.prisma.class.findMany({
      where: { ...learnerClasses(actor), course: { chapters: { some: { lessons: { some: { id: lessonId } } } } } },
      select: { id: true, course: { select: { id: true } } },
    });
    for (const { id, course } of classes) {
      const { sessions } = await loadSessions(this.prisma, id, course.id);
      if (unlockedLessons(sessions.map(toPlanned), now).has(lessonId)) {
        return true;
      }
    }
    return false;
  }

  /** `now` decides which lessons are open; a parameter so tests can pick the day. */
  async getByCode(actor: AuthContext, code: string, now = new Date()): Promise<LearnerClassDetailDto> {
    const row = await this.prisma.class.findFirst({ where: { code, ...learnerClasses(actor) }, select: learnerSelect(actor) });
    if (!row) {
      throw new NotFoundException();
    }
    const { sessions } = await loadSessions(this.prisma, row.id, row.course.id);
    const open = unlockedLessons(sessions.map(toPlanned), now);
    const files = open.size
      ? await this.prisma.lessonAttachment.findMany({
          where: { lessonId: { in: [...open] }, mimeType: PDF_TYPE },
          orderBy: { createdAt: 'asc' },
          select: { id: true, lessonId: true, fileName: true, sizeBytes: true },
        })
      : [];
    const titles = new Map(sessions.flatMap(({ lesson }) => (lesson ? [[lesson.id, lesson.title] as const] : [])));
    const learners = row.enrollments.map(({ student, attendance }) => ({ student: student.user.fullName, attendance }));
    return {
      ...toDto(row),
      sessions: sessions.map(({ id, number, startsAt, endsAt, status, lesson }) => ({
        number,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status,
        lesson: lesson && { ...lesson, unlocked: open.has(lesson.id) },
        attendance: learners.flatMap(({ student, attendance }) => attendance.filter(({ classSessionId }) => classSessionId === id).map(({ status: mark }) => ({ student, status: mark }))),
      })),
      attendance: learners.map(({ student, attendance }) => ({
        student,
        attended: attendance.filter(({ status }) => status === 'PRESENT' || status === 'LATE').length,
        marked: attendance.length,
      })),
      openLessons: [...open].map((id) => ({
        id,
        title: titles.get(id) ?? '',
        files: files.filter((file) => file.lessonId === id).map(({ id: fileId, fileName, sizeBytes }) => ({ id: fileId, fileName, sizeBytes })),
      })),
    };
  }
}
