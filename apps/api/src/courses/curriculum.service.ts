import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { ClassSessionsService } from '../classes/class-sessions.service.js';
import { PrismaService } from '../prisma.service.js';
import type { ChapterInput, CourseDetailDto, LessonInput } from './courses.dto.js';
import { CoursesService } from './courses.service.js';

type Tx = Prisma.TransactionClient;

const nextPosition = ({ _max }: { _max: { position: number | null } }) => (_max.position ?? -1) + 1;

/**
 * Renumbers items 0..n-1 in the order of `ids`, which must list every current item once.
 * Postgres checks the unique (parent, position) on every row, so everything first moves above
 * the highest current position; numbering from 0 then never meets a position still in use.
 */
async function applyOrder(
  current: { id: string; position: number }[],
  ids: string[],
  shiftAll: (by: number) => Promise<unknown>,
  place: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  const known = new Set(current.map(({ id }) => id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw new BadRequestException('ids must list every item exactly once');
  }
  if (current.length === 0) {
    return;
  }
  await shiftAll(Math.max(...current.map(({ position }) => position)) + 1);
  for (const [position, id] of ids.entries()) {
    await place(id, position);
  }
}

/**
 * Chapters and lessons of a course; every class of the course sees a change at once.
 * Every write locks the course first; each returns the updated tree.
 */
@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
    private readonly sessions: ClassSessionsService,
  ) {}

  async addChapter(actor: AuthContext, courseId: string, input: ChapterInput): Promise<CourseDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCourse(tx, courseId);
      const position = nextPosition(await tx.chapter.aggregate({ where: { courseId }, _max: { position: true } }));
      const chapter = await tx.chapter.create({ data: { courseId, title: input.title, position } });
      await this.audit(tx, actor, 'chapter.created', 'chapter', chapter.id, courseId);
    });
    return this.courses.get(courseId);
  }

  async updateChapter(actor: AuthContext, chapterId: string, input: ChapterInput): Promise<CourseDetailDto> {
    const courseId = await this.prisma.$transaction(async (tx) => {
      const courseId = await this.lockChapterCourse(tx, chapterId);
      await tx.chapter.update({ where: { id: chapterId }, data: { title: input.title } });
      await this.audit(tx, actor, 'chapter.updated', 'chapter', chapterId, courseId);
      return courseId;
    });
    return this.courses.get(courseId);
  }

  /** Only an empty chapter: deleting lessons along with it is too easy to do by mistake. */
  async deleteChapter(actor: AuthContext, chapterId: string): Promise<CourseDetailDto> {
    const courseId = await this.prisma.$transaction(async (tx) => {
      const courseId = await this.lockChapterCourse(tx, chapterId);
      if ((await tx.lesson.count({ where: { chapterId } })) > 0) {
        throw new ConflictException('Delete or move the lessons of this chapter first');
      }
      await tx.chapter.delete({ where: { id: chapterId } });
      await this.audit(tx, actor, 'chapter.deleted', 'chapter', chapterId, courseId);
      return courseId;
    });
    return this.courses.get(courseId);
  }

  async orderChapters(actor: AuthContext, courseId: string, ids: string[]): Promise<CourseDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCourse(tx, courseId);
      const where = { courseId };
      await applyOrder(
        await tx.chapter.findMany({ where, select: { id: true, position: true } }),
        ids,
        (by) => tx.chapter.updateMany({ where, data: { position: { increment: by } } }),
        (id, position) => tx.chapter.update({ where: { id }, data: { position } }),
      );
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'chapter.reordered', entityType: 'course', entityId: courseId } });
    });
    return this.courses.get(courseId);
  }

  async addLesson(actor: AuthContext, chapterId: string, input: LessonInput): Promise<CourseDetailDto> {
    const courseId = await this.prisma.$transaction(async (tx) => {
      const courseId = await this.lockChapterCourse(tx, chapterId);
      const position = nextPosition(await tx.lesson.aggregate({ where: { chapterId }, _max: { position: true } }));
      const lesson = await tx.lesson.create({ data: { chapterId, title: input.title, partCount: input.partCount, position } });
      await this.audit(tx, actor, 'lesson.created', 'lesson', lesson.id, courseId);
      return courseId;
    });
    return this.courses.get(courseId);
  }

  /** The part count cannot drop below a part that class sessions already teach: their progress would point nowhere. */
  async updateLesson(actor: AuthContext, lessonId: string, input: LessonInput): Promise<CourseDetailDto> {
    const courseId = await this.prisma.$transaction(async (tx) => {
      const courseId = await this.lockLessonCourse(tx, lessonId);
      const { _max } = await tx.classSessionLesson.aggregate({ where: { lessonId }, _max: { partNumber: true } });
      if (_max.partNumber !== null && input.partCount < _max.partNumber) {
        throw new ConflictException(`Class sessions already teach part ${_max.partNumber} of this lesson`);
      }
      await tx.lesson.update({ where: { id: lessonId }, data: { title: input.title, partCount: input.partCount } });
      await this.audit(tx, actor, 'lesson.updated', 'lesson', lessonId, courseId);
      return courseId;
    });
    return this.courses.get(courseId);
  }

  /** Only a lesson without files and not taught in any class session, like a chapter without lessons. */
  async deleteLesson(actor: AuthContext, lessonId: string): Promise<CourseDetailDto> {
    try {
      const courseId = await this.prisma.$transaction(async (tx) => {
        const courseId = await this.lockLessonCourse(tx, lessonId);
        if ((await tx.lessonAttachment.count({ where: { lessonId } })) > 0) {
          throw new ConflictException('Delete the files of this lesson first');
        }
        if ((await tx.classSessionLesson.count({ where: { lessonId } })) > 0) {
          throw new ConflictException('Class sessions already teach this lesson');
        }
        await tx.lesson.delete({ where: { id: lessonId } });
        await this.audit(tx, actor, 'lesson.deleted', 'lesson', lessonId, courseId);
        return courseId;
      });
      return await this.courses.get(courseId);
    } catch (error) {
      // Both links are ON DELETE RESTRICT; one may land after the checks above, since class sessions do not lock the course.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('This lesson is still in use');
      }
      throw error;
    }
  }

  async orderLessons(actor: AuthContext, chapterId: string, ids: string[]): Promise<CourseDetailDto> {
    const courseId = await this.prisma.$transaction(async (tx) => {
      const courseId = await this.lockChapterCourse(tx, chapterId);
      const where = { chapterId };
      await applyOrder(
        await tx.lesson.findMany({ where, select: { id: true, position: true } }),
        ids,
        (by) => tx.lesson.updateMany({ where, data: { position: { increment: by } } }),
        (id, position) => tx.lesson.update({ where: { id }, data: { position } }),
      );
      await this.audit(tx, actor, 'lesson.reordered', 'chapter', chapterId, courseId);
      return courseId;
    });
    return this.courses.get(courseId);
  }

  private lockChapterCourse(tx: Tx, chapterId: string): Promise<string> {
    return this.lockCourseOf(tx, async () => (await tx.chapter.findUnique({ where: { id: chapterId }, select: { courseId: true } }))?.courseId);
  }

  /** Locks the course the lesson belongs to and returns its id; for every write to the lesson or its files. */
  lockLessonCourse(tx: Tx, lessonId: string): Promise<string> {
    return this.lockCourseOf(tx, async () => (await tx.lesson.findUnique({ where: { id: lessonId }, select: { chapter: { select: { courseId: true } } } }))?.chapter.courseId);
  }

  /** Finds the item's course, locks it, then looks again: the item may have been deleted while we waited. */
  private async lockCourseOf(tx: Tx, findCourseId: () => Promise<string | undefined>): Promise<string> {
    const courseId = await findCourseId();
    if (!courseId) {
      throw new NotFoundException();
    }
    await this.lockCourse(tx, courseId);
    if ((await findCourseId()) !== courseId) {
      throw new NotFoundException();
    }
    return courseId;
  }

  /**
   * Locks the course row until the transaction ends: two writes to one tree (say, two reorders) run one after
   * the other instead of meeting on the unique positions, and archiving waits for a write already under way.
   */
  private async lockCourse(tx: Tx, courseId: string): Promise<void> {
    const [course] = await tx.$queryRaw<{ archived_at: Date | null }[]>`SELECT archived_at FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
    if (!course) {
      throw new NotFoundException();
    }
    if (course.archived_at) {
      throw new ConflictException('The course is archived');
    }
    // Before any check or change: an ended session not settled yet would take its part from the edited tree.
    await this.sessions.settleCourse(tx, courseId);
  }

  private async audit(tx: Tx, actor: AuthContext, action: string, entityType: string, entityId: string, courseId: string): Promise<void> {
    await tx.auditLog.create({ data: { actorId: actor.user.id, action, entityType, entityId, metadata: { courseId } } });
  }
}
