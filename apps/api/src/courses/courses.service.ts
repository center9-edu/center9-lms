import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import { retryOnUniqueConflict } from '../profile-code.js';
import { MAX_SLUG_LENGTH } from './courses.dto.js';
import type { CourseDetailDto, CourseSummaryDto, CreateCourseInput, UpdateCourseInput } from './courses.dto.js';

// ponytail: one page is enough for one center; add paging when courses outgrow it.
const MAX_LISTED_COURSES = 1_000;
// Room for a "-NN" suffix within MAX_SLUG_LENGTH.
const MAX_BASE_SLUG_LENGTH = MAX_SLUG_LENGTH - 5;
const FALLBACK_SLUG = 'khoa-hoc';
const BY_POSITION = { orderBy: { position: 'asc' } } as const;
// Lesson content is left out: the tree only lists lessons.
const TREE_INCLUDE = {
  chapters: {
    ...BY_POSITION,
    include: {
      lessons: {
        ...BY_POSITION,
        select: {
          id: true,
          title: true,
          position: true,
          partCount: true,
          attachments: { orderBy: { createdAt: 'asc' }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
        },
      },
    },
  },
} as const;

type CourseWithTree = Prisma.CourseGetPayload<{ include: typeof TREE_INCLUDE }>;

/** "Lập trình Python cơ bản" → "lap-trinh-python-co-ban": no diacritics, lowercase, words joined by "-". */
export function toSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_BASE_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug || FALLBACK_SLUG;
}

function toDetail(course: CourseWithTree): CourseDetailDto {
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    subject: course.subject,
    level: course.level,
    archivedAt: course.archivedAt?.toISOString() ?? null,
    createdAt: course.createdAt.toISOString(),
    chapters: course.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      position: chapter.position,
      lessons: chapter.lessons.map(({ id, title, position, partCount, attachments }) => ({
        id,
        title,
        position,
        partCount,
        files: attachments.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
      })),
    })),
  };
}

/** `base`, else `base-2`, `base-3`, … whichever no course uses yet. */
async function freeSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  const taken = new Set((await tx.course.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map(({ slug }) => slug));
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CourseSummaryDto[]> {
    const courses = await this.prisma.course.findMany({
      select: { id: true, title: true, slug: true, description: true, subject: true, level: true, archivedAt: true },
      orderBy: { title: 'asc' },
      take: MAX_LISTED_COURSES,
    });
    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      subject: course.subject,
      level: course.level,
      archived: course.archivedAt !== null,
    }));
  }

  async get(courseId: string): Promise<CourseDetailDto> {
    return toDetail(await this.findWithTree(this.prisma, { id: courseId }));
  }

  async getBySlug(slug: string): Promise<CourseDetailDto> {
    return toDetail(await this.findWithTree(this.prisma, { slug }));
  }

  async create(actor: AuthContext, input: CreateCourseInput): Promise<CourseDetailDto> {
    // Two courses with the same title at once: the loser's retry picks the next free slug.
    return retryOnUniqueConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const course = await tx.course.create({
          data: { ...input, slug: await freeSlug(tx, toSlug(input.title)), createdById: actor.user.id },
        });
        await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'course.created', entityType: 'course', entityId: course.id } });
        return toDetail({ ...course, chapters: [] });
      }),
    );
  }

  async update(actor: AuthContext, courseId: string, input: UpdateCourseInput): Promise<CourseDetailDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Locked first, as curriculum writes do, so an archive cannot slip between this check and the update.
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
        const course = await tx.course.findUnique({ where: { id: courseId }, select: { slug: true, archivedAt: true } });
        if (!course) {
          throw new NotFoundException();
        }
        if (course.archivedAt) {
          throw new ConflictException('The course is archived');
        }
        const slugChanged = input.slug !== course.slug;
        const updated = await tx.course.update({ where: { id: courseId }, data: input, include: TREE_INCLUDE });
        await tx.auditLog.create({
          data: { actorId: actor.user.id, action: 'course.updated', entityType: 'course', entityId: courseId, metadata: { slugChanged } },
        });
        return toDetail(updated);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This slug is already used by another course');
      }
      throw error;
    }
  }

  /** Hides the course from new work and freezes its curriculum; its classes stay. Archiving twice changes nothing. */
  async archive(actor: AuthContext, courseId: string): Promise<CourseDetailDto> {
    return this.prisma.$transaction(async (tx) => {
      const course = await this.findWithTree(tx, { id: courseId });
      if (course.archivedAt) {
        return toDetail(course);
      }
      const archived = await tx.course.update({ where: { id: courseId }, data: { archivedAt: new Date() }, include: TREE_INCLUDE });
      await tx.auditLog.create({ data: { actorId: actor.user.id, action: 'course.archived', entityType: 'course', entityId: courseId } });
      return toDetail(archived);
    });
  }

  private async findWithTree(db: Prisma.TransactionClient, where: Prisma.CourseWhereUniqueInput): Promise<CourseWithTree> {
    const course = await db.course.findUnique({ where, include: TREE_INCLUDE });
    if (!course) {
      throw new NotFoundException();
    }
    return course;
  }
}
