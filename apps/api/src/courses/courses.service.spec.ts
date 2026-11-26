import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { PrismaService } from '../prisma.service.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService, toSlug } from './courses.service.js';

/** The tree as Prisma returns it: files are attachments with a Date. */
interface StoredChapter {
  id: string;
  title: string;
  position: number;
  lessons: {
    id: string;
    title: string;
    position: number;
    partCount: number;
    attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date }[];
  }[];
}
interface StoredCourse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  subject: string;
  level: string;
  archivedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  chapters: StoredChapter[];
}

const teacher: AuthContext = {
  sessionId: 's1',
  user: { id: 'gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', roles: ['TEACHER'], mustChangePassword: false },
};
const CREATED_AT = new Date('2026-11-17T03:00:00Z');
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

function course(overrides: Partial<StoredCourse> & { id: string; slug: string }): StoredCourse {
  return { title: overrides.slug, description: null, subject: 'SCRATCH', level: 'BASIC', archivedAt: null, createdById: null, createdAt: CREATED_AT, chapters: [], ...overrides };
}

function setup(courses: StoredCourse[] = [], { slugRaces = 0 } = {}) {
  const store = new Map(courses.map((c) => [c.id, { ...c }]));
  const audit: { action: string; entityId: string; metadata?: unknown }[] = [];
  const locked: string[] = [];
  let nextId = 1;
  let racesLeft = slugRaces;
  const bySlug = (slug: string) => [...store.values()].find((c) => c.slug === slug);

  const prisma = {
    course: {
      findMany: vi.fn(async ({ where }: { where?: { slug?: { startsWith: string } } } = {}) => {
        const all = [...store.values()];
        if (where?.slug) {
          return all.filter((c) => c.slug.startsWith(where.slug!.startsWith)).map((c) => ({ slug: c.slug }));
        }
        return all.map((c) => ({ ...c }));
      }),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => {
        const found = where.id ? store.get(where.id) : bySlug(where.slug!);
        return found ? { ...found } : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<StoredCourse, 'id' | 'createdAt' | 'chapters' | 'archivedAt'> }) => {
        if (racesLeft > 0 || bySlug(data.slug)) {
          racesLeft = Math.max(0, racesLeft - 1);
          // A concurrent request took the slug between the check and the insert.
          store.set(`race-${data.slug}`, course({ id: `race-${data.slug}`, slug: data.slug }));
          throw unique();
        }
        const created = course({ ...data, id: `c${nextId++}` });
        store.set(created.id, created);
        return { ...created };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredCourse> }) => {
        if (data.slug && [...store.values()].some((c) => c.slug === data.slug && c.id !== where.id)) {
          throw unique();
        }
        const updated = Object.assign(store.get(where.id)!, data);
        return { ...updated };
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    // The course row lock: SELECT id FROM courses … FOR UPDATE.
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, id: string) => {
      locked.push(id);
      return store.has(id) ? [{ id }] : [];
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { service: new CoursesService(prisma as unknown as PrismaService), store, audit, locked };
}

describe('toSlug', () => {
  it.each([
    ['Lập trình Python cơ bản', 'lap-trinh-python-co-ban'],
    ['  Đồ hoạ & Scratch!! ', 'do-hoa-scratch'],
    ['Lớp 6 — Tin học', 'lop-6-tin-hoc'],
    ['!!!', 'khoa-hoc'],
  ])('%s → %s', (title, slug) => {
    expect(toSlug(title)).toBe(slug);
  });

  it('keeps slugs short enough for a URL', () => {
    expect(toSlug('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('CoursesService.create', () => {
  it('creates a course with a slug from the title and audits it', async () => {
    const { service, audit } = setup();
    await expect(service.create(teacher, { title: 'Lập trình Python', description: null, subject: 'PYTHON', level: 'INTERMEDIATE' })).resolves.toEqual({
      id: 'c1',
      title: 'Lập trình Python',
      slug: 'lap-trinh-python',
      description: null,
      subject: 'PYTHON',
      level: 'INTERMEDIATE',
      archivedAt: null,
      createdAt: CREATED_AT.toISOString(),
      chapters: [],
    });
    expect(audit).toEqual([{ actorId: 'gv-lan', action: 'course.created', entityType: 'course', entityId: 'c1' }]);
  });

  it('adds -2, -3 when the slug is taken', async () => {
    const { service } = setup([course({ id: 'a', slug: 'python' }), course({ id: 'b', slug: 'python-2' })]);
    await expect(service.create(teacher, { title: 'Python', description: null, subject: 'PYTHON', level: 'BASIC' })).resolves.toMatchObject({ slug: 'python-3' });
  });

  it('picks the next free slug when a concurrent request took it', async () => {
    const { service } = setup([], { slugRaces: 1 });
    await expect(service.create(teacher, { title: 'Python', description: null, subject: 'PYTHON', level: 'BASIC' })).resolves.toMatchObject({ slug: 'python-2' });
  });
});

describe('CoursesService reads', () => {
  it('lists courses with their description, subject and level', async () => {
    const { service } = setup([
      course({ id: 'a', slug: 'python', title: 'Python', description: 'Cho lớp 6', subject: 'PYTHON', level: 'ADVANCED' }),
      course({ id: 'b', slug: 'scratch', title: 'Scratch', archivedAt: CREATED_AT }),
    ]);
    await expect(service.list()).resolves.toEqual([
      { id: 'a', title: 'Python', slug: 'python', description: 'Cho lớp 6', subject: 'PYTHON', level: 'ADVANCED', archived: false },
      { id: 'b', title: 'Scratch', slug: 'scratch', description: null, subject: 'SCRATCH', level: 'BASIC', archived: true },
    ]);
  });

  it('gets a course by slug or id with its chapter and lesson tree and each lesson’s files, and 404s otherwise', async () => {
    const file = { id: 'f1', fileName: 'Bài 1.pdf', mimeType: 'application/pdf', sizeBytes: 1024, createdAt: CREATED_AT };
    const chapters: StoredChapter[] = [{ id: 'ch1', title: 'Biến', position: 0, lessons: [{ id: 'l1', title: 'Gán giá trị', position: 0, partCount: 2, attachments: [file] }] }];
    const { service } = setup([course({ id: 'a', slug: 'python', chapters })]);
    const tree = [{ id: 'ch1', title: 'Biến', position: 0, lessons: [{ id: 'l1', title: 'Gán giá trị', position: 0, partCount: 2, files: [{ ...file, createdAt: CREATED_AT.toISOString() }] }] }];
    await expect(service.getBySlug('python')).resolves.toMatchObject({ id: 'a', chapters: tree });
    await expect(service.get('a')).resolves.toMatchObject({ slug: 'python', chapters: tree });
    await expect(service.getBySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CoursesService.update / archive', () => {
  const input = { title: 'Python nâng cao', description: 'Mô tả', slug: 'python-nang-cao', subject: 'PYTHON' as const, level: 'ADVANCED' as const };

  it('updates title, description and slug at any time, under the course lock (an archive cannot slip in)', async () => {
    const { service, audit, locked } = setup([course({ id: 'a', slug: 'python' })]);
    await expect(service.update(teacher, 'a', input)).resolves.toMatchObject(input);
    expect(locked).toEqual(['a']);
    expect(audit).toEqual([{ actorId: 'gv-lan', action: 'course.updated', entityType: 'course', entityId: 'a', metadata: { slugChanged: true } }]);
  });

  it('409s for a slug another course uses, 404s for an unknown course', async () => {
    const { service } = setup([course({ id: 'a', slug: 'python' }), course({ id: 'b', slug: 'scratch' })]);
    await expect(service.update(teacher, 'a', { ...input, slug: 'scratch' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(teacher, 'missing', input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives once; an archived course cannot be edited', async () => {
    const { service, audit } = setup([course({ id: 'a', slug: 'python' })]);
    const archived = await service.archive(teacher, 'a');
    expect(archived.archivedAt).not.toBeNull();
    await service.archive(teacher, 'a');
    expect(audit.map((entry) => entry.action)).toEqual(['course.archived']);
    await expect(service.update(teacher, 'a', input)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CoursesController', () => {
  const controller = (calls: unknown[][]) =>
    new CoursesController({
      create: vi.fn(async (...args: unknown[]) => calls.push(args)),
      update: vi.fn(async (...args: unknown[]) => calls.push(args)),
    } as unknown as CoursesService);

  it('lets staff read, and only admins and teachers write', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CoursesController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES']);
    for (const method of ['create', 'update', 'archive'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, CoursesController.prototype[method])).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER']);
    }
  });

  it('trims the title, turns a blank description into null and passes the subject and level', () => {
    const calls: unknown[][] = [];
    void controller(calls).create(teacher, { title: '  Python ', description: '  ', subject: 'PYTHON', level: 'BASIC' });
    expect(calls[0]?.[1]).toEqual({ title: 'Python', description: null, subject: 'PYTHON', level: 'BASIC' });
  });

  it.each([
    {},
    { title: '  ', subject: 'PYTHON', level: 'BASIC' },
    { title: 'x'.repeat(151), subject: 'PYTHON', level: 'BASIC' },
    { title: 'X', description: 'x'.repeat(2001), subject: 'PYTHON', level: 'BASIC' },
    { title: 'X', subject: 'PYTHON' },
    { title: 'X', subject: 'PYTHON', level: 'basic' },
    { title: 'X', subject: 'PYTHON', level: 'EXPERT' },
    { title: 'X', level: 'BASIC' },
    { title: 'X', subject: 'python', level: 'BASIC' },
    { title: 'X', subject: 'OTHER', level: 'BASIC' },
  ])('rejects course %j', (body) => {
    expect(() => controller([]).create(teacher, body)).toThrow(BadRequestException);
  });

  it.each(['Python', 'python_co_ban', '-python', 'python-', 'py--thon', 'x'.repeat(61)])('rejects slug %s', (slug) => {
    expect(() => controller([]).update(teacher, '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10', { title: 'X', slug, subject: 'PYTHON', level: 'BASIC' })).toThrow(BadRequestException);
  });

  it('requires a subject and a level when updating', () => {
    const id = '6f1c2a52-3a0b-4c55-9d7e-0f6b1f6c2a10';
    expect(() => controller([]).update(teacher, id, { title: 'X', slug: 'x', subject: 'WEB' })).toThrow(BadRequestException);
    expect(() => controller([]).update(teacher, id, { title: 'X', slug: 'x', level: 'BASIC' })).toThrow(BadRequestException);
    const calls: unknown[][] = [];
    void controller(calls).update(teacher, id, { title: 'X', slug: 'x', subject: 'ROBOTICS', level: 'INTERMEDIATE' });
    expect(calls[0]?.[2]).toMatchObject({ subject: 'ROBOTICS', level: 'INTERMEDIATE' });
  });
});
