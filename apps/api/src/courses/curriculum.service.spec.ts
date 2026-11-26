import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import type { ClassSessionsService } from '../classes/class-sessions.service.js';
import type { CoursesService } from './courses.service.js';
import { CurriculumController } from './curriculum.controller.js';
import { CurriculumService } from './curriculum.service.js';

interface Row {
  id: string;
  parentId: string;
  title: string;
  position: number;
  partCount?: number;
}

const teacher: AuthContext = {
  sessionId: 's1',
  user: { id: 'gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', roles: ['TEACHER'], mustChangePassword: false },
};
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
const UUIDS = ['6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10', '7a2d3b63-4b1c-4d66-8e8f-1a7c2a7d3b21'];

/**
 * A fake table with the real unique (parent, position) rule, checked on every write,
 * so a reorder that collides midway fails here as it would in Postgres.
 */
function table(rows: Row[], parentKey: 'courseId' | 'chapterId', prefix: string) {
  const store = new Map(rows.map((row) => [row.id, { ...row }]));
  let nextId = 1;
  const siblings = (parentId: string) => [...store.values()].filter((row) => row.parentId === parentId);
  const assertUnique = (parentId: string) => {
    const positions = siblings(parentId).map((row) => row.position);
    if (new Set(positions).size !== positions.length) {
      throw unique();
    }
  };
  const external = (row: Row | undefined) => row && { ...row, [parentKey]: row.parentId };
  const delegate = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => external(store.get(where.id)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Record<string, string> }) => siblings(where[parentKey]!).map(external)),
    aggregate: vi.fn(async ({ where }: { where: Record<string, string> }) => {
      const positions = siblings(where[parentKey]!).map((row) => row.position);
      return { _max: { position: positions.length ? Math.max(...positions) : null } };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> & { title: string; position: number } }) => {
      const { [parentKey]: parentId, ...rest } = data;
      const row = { ...rest, id: `${prefix}${nextId++}`, parentId: String(parentId) } as Row;
      store.set(row.id, row);
      assertUnique(row.parentId);
      return external(row);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = Object.assign(store.get(where.id)!, data);
      assertUnique(row.parentId);
      return external(row);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, string>; data: { position: { increment: number } } }) => {
      for (const row of siblings(where[parentKey]!)) {
        row.position += data.position.increment;
      }
      assertUnique(where[parentKey]!);
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => store.delete(where.id)),
    count: vi.fn(async ({ where }: { where: Record<string, string> }) => siblings(where[parentKey]!).length),
  };
  return { store, delegate };
}

/** `taught` maps a lesson id to the part numbers class sessions link to it; `files` to its file count. */
function setup({
  chapters = [] as Row[],
  lessons = [] as Row[],
  courses = ['c1'],
  archived = [] as string[],
  taught = {} as Record<string, number[]>,
  files = {} as Record<string, number>,
  // Parts that sessions already over taught, recorded only once they are settled.
  unsettled = {} as Record<string, number[]>,
} = {}) {
  const chapterTable = table(chapters, 'courseId', 'ch');
  const lessonTable = table(lessons, 'chapterId', 'l');
  const audit: { action: string; entityType: string; entityId: string; metadata?: unknown }[] = [];
  const locked: string[] = [];
  const prisma = {
    // The course row lock: SELECT archived_at FROM courses WHERE id = … FOR UPDATE.
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, courseId: string) => {
      locked.push(courseId);
      return courses.includes(courseId) ? [{ archived_at: archived.includes(courseId) ? new Date() : null }] : [];
    }),
    chapter: chapterTable.delegate,
    lesson: {
      ...lessonTable.delegate,
      // Lessons are found with their chapter's course.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const lesson = lessonTable.store.get(where.id);
        return lesson ? { ...lesson, chapter: { courseId: chapterTable.store.get(lesson.parentId)!.parentId } } : null;
      }),
    },
    classSessionLesson: {
      aggregate: vi.fn(async ({ where }: { where: { lessonId: string } }) => {
        const parts = taught[where.lessonId] ?? [];
        return { _max: { partNumber: parts.length ? Math.max(...parts) : null } };
      }),
      count: vi.fn(async ({ where }: { where: { lessonId: string } }) => (taught[where.lessonId] ?? []).length),
    },
    lessonAttachment: { count: vi.fn(async ({ where }: { where: { lessonId: string } }) => files[where.lessonId] ?? 0) },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const coursesService = { get: vi.fn(async (courseId: string) => ({ id: courseId })) };
  // Settling records what the ended sessions taught; it must run with the course already locked.
  const settled: string[] = [];
  const sessions = {
    settleCourse: vi.fn(async (_tx: unknown, courseId: string) => {
      settled.push(locked.includes(courseId) ? courseId : `${courseId} before the lock`);
      for (const [lessonId, parts] of Object.entries(unsettled)) {
        taught[lessonId] = [...(taught[lessonId] ?? []), ...parts];
      }
    }),
  };
  const service = new CurriculumService(prisma as unknown as PrismaService, coursesService as unknown as CoursesService, sessions as unknown as ClassSessionsService);
  return { service, prisma, chapters: chapterTable.store, lessons: lessonTable.store, audit, locked, settled };
}

const ordered = (store: Map<string, Row>, parentId: string) =>
  [...store.values()]
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((row) => [row.id, row.position]);

describe('CurriculumService chapters', () => {
  it('adds a chapter after the last one, audits it and returns the tree', async () => {
    const { service, chapters, audit } = setup({ chapters: [{ id: 'a', parentId: 'c1', title: 'A', position: 4 }] });
    await expect(service.addChapter(teacher, 'c1', { title: 'Biến' })).resolves.toEqual({ id: 'c1' });
    expect(chapters.get('ch1')).toMatchObject({ title: 'Biến', position: 5, parentId: 'c1' });
    expect(audit).toEqual([{ actorId: 'gv-lan', action: 'chapter.created', entityType: 'chapter', entityId: 'ch1', metadata: { courseId: 'c1' } }]);
  });

  it('numbers the first chapter 0', async () => {
    const { service, chapters } = setup();
    await service.addChapter(teacher, 'c1', { title: 'Biến' });
    expect(chapters.get('ch1')?.position).toBe(0);
  });

  it('renames a chapter and locks its course', async () => {
    const { service, chapters, locked } = setup({ chapters: [{ id: 'a', parentId: 'c1', title: 'A', position: 0 }] });
    await service.updateChapter(teacher, 'a', { title: 'Vòng lặp' });
    expect(chapters.get('a')?.title).toBe('Vòng lặp');
    expect(locked).toEqual(['c1']);
  });

  it('409s for any change in an archived course', async () => {
    const { service, chapters } = setup({ chapters: [{ id: 'a', parentId: 'c1', title: 'A', position: 0 }], archived: ['c1'] });
    await expect(service.addChapter(teacher, 'c1', { title: 'X' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateChapter(teacher, 'a', { title: 'X' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deleteChapter(teacher, 'a')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.orderChapters(teacher, 'c1', ['a'])).rejects.toBeInstanceOf(ConflictException);
    expect(chapters.get('a')).toMatchObject({ title: 'A' });
  });

  it('deletes an empty chapter, but 409s while it still has lessons', async () => {
    const { service, chapters, audit } = setup({
      chapters: [
        { id: 'a', parentId: 'c1', title: 'A', position: 0 },
        { id: 'b', parentId: 'c1', title: 'B', position: 1 },
      ],
      lessons: [{ id: 'l', parentId: 'b', title: 'L', position: 0, partCount: 1 }],
    });
    await service.deleteChapter(teacher, 'a');
    expect(chapters.has('a')).toBe(false);
    await expect(service.deleteChapter(teacher, 'b')).rejects.toBeInstanceOf(ConflictException);
    expect(audit.map(({ action, entityId }) => [action, entityId])).toEqual([['chapter.deleted', 'a']]);
  });

  it('404s for an unknown course or chapter', async () => {
    const { service } = setup();
    await expect(service.addChapter(teacher, 'missing', { title: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.orderChapters(teacher, 'missing', [])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateChapter(teacher, 'missing', { title: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteChapter(teacher, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reorders chapters to 0..n-1 without breaking unique positions', async () => {
    const { service, chapters, audit } = setup({
      chapters: [
        { id: 'a', parentId: 'c1', title: 'A', position: 0 },
        { id: 'b', parentId: 'c1', title: 'B', position: 3 },
        { id: 'c', parentId: 'c1', title: 'C', position: 4 },
      ],
    });
    await service.orderChapters(teacher, 'c1', ['c', 'a', 'b']);
    expect(ordered(chapters, 'c1')).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect(audit).toEqual([{ actorId: 'gv-lan', action: 'chapter.reordered', entityType: 'course', entityId: 'c1' }]);
  });

  it.each([[['a']], [['a', 'b', 'x']], [['a', 'a']], [['a', 'b', 'b']]])('400s for an order %j that is not every chapter once', async (ids) => {
    const { service, chapters } = setup({
      chapters: [
        { id: 'a', parentId: 'c1', title: 'A', position: 0 },
        { id: 'b', parentId: 'c1', title: 'B', position: 1 },
      ],
    });
    await expect(service.orderChapters(teacher, 'c1', ids)).rejects.toBeInstanceOf(BadRequestException);
    expect(ordered(chapters, 'c1')).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });
});

describe('CurriculumService lessons', () => {
  const chapters: Row[] = [{ id: 'a', parentId: 'c1', title: 'A', position: 0 }];

  it('adds a lesson after the last one in its chapter and locks the chapter’s course', async () => {
    const { service, lessons, locked, audit } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 2, partCount: 1 }] });
    await expect(service.addLesson(teacher, 'a', { title: 'Gán giá trị', partCount: 2 })).resolves.toEqual({ id: 'c1' });
    expect(lessons.get('l1')).toMatchObject({ parentId: 'a', title: 'Gán giá trị', partCount: 2, position: 3 });
    expect(locked).toEqual(['c1']);
    expect(audit).toEqual([{ actorId: 'gv-lan', action: 'lesson.created', entityType: 'lesson', entityId: 'l1', metadata: { courseId: 'c1' } }]);
  });

  it('updates and deletes a lesson', async () => {
    const { service, lessons } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 1 }] });
    await service.updateLesson(teacher, 'x', { title: 'Y', partCount: 3 });
    expect(lessons.get('x')).toMatchObject({ title: 'Y', partCount: 3 });
    await service.deleteLesson(teacher, 'x');
    expect(lessons.has('x')).toBe(false);
  });

  it('409s when deleting a lesson that still has files or is taught in a class session', async () => {
    const lesson = { id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 1 };
    const withFiles = setup({ chapters, lessons: [lesson], files: { x: 1 } });
    await expect(withFiles.service.deleteLesson(teacher, 'x')).rejects.toThrow('Delete the files of this lesson first');
    const taught = setup({ chapters, lessons: [lesson], taught: { x: [1] } });
    await expect(taught.service.deleteLesson(teacher, 'x')).rejects.toThrow('Class sessions already teach this lesson');
    expect(withFiles.lessons.has('x') && taught.lessons.has('x')).toBe(true);
    expect([...withFiles.audit, ...taught.audit]).toEqual([]);
  });

  it('409s when a link appears after the checks (the foreign key restricts the delete)', async () => {
    const { service, prisma, lessons } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 1 }] });
    const restricted = new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', { code: 'P2003', clientVersion: 'test' });
    prisma.lesson.delete.mockRejectedValueOnce(restricted);
    await expect(service.deleteLesson(teacher, 'x')).rejects.toBeInstanceOf(ConflictException);
    expect(lessons.has('x')).toBe(true);
  });

  it('lowers the part count down to the highest part already taught, but not below it', async () => {
    const { service, lessons } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 4 }], taught: { x: [1, 2] } });
    await service.updateLesson(teacher, 'x', { title: 'X', partCount: 2 });
    expect(lessons.get('x')?.partCount).toBe(2);
    await expect(service.updateLesson(teacher, 'x', { title: 'Y', partCount: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect(lessons.get('x')).toMatchObject({ title: 'X', partCount: 2 });
  });

  it('settles the course’s ended sessions first, under the lock, so the guards see what they taught', async () => {
    // Yesterday's session taught X part 2, but nobody has opened the class since.
    const { service, lessons, settled } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 4 }], unsettled: { x: [1, 2] } });
    await expect(service.updateLesson(teacher, 'x', { title: 'X', partCount: 1 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deleteLesson(teacher, 'x')).rejects.toBeInstanceOf(ConflictException);
    expect(lessons.get('x')?.partCount).toBe(4);
    expect(settled[0]).toBe('c1');
  });

  it('settles before reordering or adding too: any change to the tree moves the parts of sessions not settled', async () => {
    const { service, settled } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 1 }] });
    await service.addLesson(teacher, 'a', { title: 'Y', partCount: 1 });
    await service.orderChapters(teacher, 'c1', ['a']);
    expect(settled).toEqual(['c1', 'c1']);
  });

  it('changes the part count freely while no class session teaches the lesson', async () => {
    const { service, lessons } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 4 }] });
    await service.updateLesson(teacher, 'x', { title: 'X', partCount: 1 });
    expect(lessons.get('x')?.partCount).toBe(1);
  });

  it('409s for lesson changes in an archived course, 404s for unknown ids', async () => {
    const { service } = setup({ chapters, lessons: [{ id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 1 }], archived: ['c1'] });
    await expect(service.addLesson(teacher, 'a', { title: 'Y', partCount: 1 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateLesson(teacher, 'x', { title: 'Y', partCount: 1 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deleteLesson(teacher, 'x')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.addLesson(teacher, 'missing', { title: 'Y', partCount: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateLesson(teacher, 'missing', { title: 'Y', partCount: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reorders the lessons of one chapter only', async () => {
    const { service, lessons } = setup({
      chapters: [...chapters, { id: 'b', parentId: 'c1', title: 'B', position: 1 }],
      lessons: [
        { id: 'x', parentId: 'a', title: 'X', position: 0, partCount: 1 },
        { id: 'y', parentId: 'a', title: 'Y', position: 1, partCount: 1 },
        { id: 'z', parentId: 'b', title: 'Z', position: 0, partCount: 1 },
      ],
    });
    await expect(service.orderLessons(teacher, 'a', ['x', 'z'])).rejects.toBeInstanceOf(BadRequestException);
    await service.orderLessons(teacher, 'a', ['y', 'x']);
    expect(ordered(lessons, 'a')).toEqual([
      ['y', 0],
      ['x', 1],
    ]);
    expect(ordered(lessons, 'b')).toEqual([['z', 0]]);
  });
});

describe('CurriculumController', () => {
  const calls: unknown[][] = [];
  const controller = new CurriculumController(
    new Proxy({}, { get: () => vi.fn(async (...args: unknown[]) => calls.push(args)) }) as unknown as CurriculumService,
  );

  it('lets only admins and teachers change the curriculum', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CurriculumController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER']);
  });

  it('trims titles and passes the part count through', () => {
    calls.length = 0;
    void controller.addLesson(teacher, UUIDS[0]!, { title: ' Biến ', partCount: 2 });
    expect(calls[0]?.[2]).toEqual({ title: 'Biến', partCount: 2 });
  });

  it.each([{ title: 'X' }, { title: 'X', partCount: 0 }, { title: 'X', partCount: 51 }, { title: 'X', partCount: 1.5 }, { title: 'X', partCount: '2' }, { title: ' ', partCount: 1 }])(
    'rejects lesson %j',
    (body) => {
      expect(() => controller.addLesson(teacher, UUIDS[0]!, body)).toThrow(BadRequestException);
    },
  );

  it.each([{}, { ids: 'a' }, { ids: ['not-a-uuid'] }])('rejects order %j', (body) => {
    expect(() => controller.orderChapters(teacher, UUIDS[0]!, body)).toThrow(BadRequestException);
  });

  it('accepts an order of ids', () => {
    calls.length = 0;
    void controller.orderLessons(teacher, UUIDS[0]!, { ids: UUIDS });
    expect(calls[0]?.[2]).toEqual(UUIDS);
  });
});
