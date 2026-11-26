import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { LearnerClassesService } from '../classes/learner-classes.service.js';
import type { CurriculumService } from '../courses/curriculum.service.js';
import type { PrismaService } from '../prisma.service.js';
import { LessonFilesController } from './lesson-files.controller.js';
import { cleanFileName, contentDisposition, DOCX_TYPE, LessonFilesService, PDF_TYPE } from './lesson-files.service.js';
import type { UploadedLessonFile } from './lesson-files.service.js';

interface StoredFile {
  id: string;
  lessonId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

const teacher: AuthContext = {
  sessionId: 's1',
  user: { id: 'gv-lan', username: 'gv.lan', fullName: 'Trần Thị Lan', roles: ['TEACHER'], mustChangePassword: false },
};
const learner = (id: string, roles: AuthContext['user']['roles']): AuthContext => ({
  sessionId: 's2',
  user: { id, username: id, fullName: id, roles, mustChangePassword: false },
});
const an = learner('hs-an', ['STUDENT']);
const hung = learner('ph-hung', ['PARENT']);
const minh = learner('hs-minh', ['STUDENT']);
const CREATED_AT = new Date('2026-11-17T03:00:00Z');
const PDF_BYTES = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
const DOCX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const EXE_BYTES = Buffer.from('MZ\x90\x00\x03\x00');

const upload = (originalname: string, buffer: Buffer, mimetype = originalname.endsWith('.pdf') ? PDF_TYPE : DOCX_TYPE): UploadedLessonFile => ({
  originalname,
  mimetype,
  size: buffer.length,
  buffer,
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lesson-files-'));
  vi.stubEnv('UPLOAD_DIR', dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

/** `openFor` lists "userId:lessonId" pairs: the lessons a learner has open in one of their classes. */
function setup({ files = [] as StoredFile[], editable = ['l1'], failInsert = false, openFor = ['hs-an:l1', 'ph-hung:l1'] } = {}) {
  const store = new Map(files.map((file) => [file.id, { ...file }]));
  const audit: { action: string; entityId: string; metadata?: unknown }[] = [];
  let nextId = 1;
  const prisma = {
    lessonAttachment: {
      count: vi.fn(async ({ where }: { where: { lessonId: string } }) => [...store.values()].filter((f) => f.lessonId === where.lessonId).length),
      create: vi.fn(async ({ data }: { data: Omit<StoredFile, 'id' | 'createdAt'> }) => {
        if (failInsert) {
          throw new Error('database is down');
        }
        const file = { ...data, id: `f${nextId++}`, createdAt: CREATED_AT };
        store.set(file.id, file);
        return file;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => ({ count: store.delete(where.id) ? 1 : 0 })),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: (typeof audit)[number] }) => audit.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  // Lesson l1 is in course c1; any other lesson is in an archived course.
  const curriculum = {
    lockLessonCourse: vi.fn(async (_tx: unknown, lessonId: string) => {
      if (!editable.includes(lessonId)) {
        throw new ConflictException();
      }
      return 'c1';
    }),
  };
  const learners = { canOpenLesson: vi.fn(async (actor: AuthContext, lessonId: string) => openFor.includes(`${actor.user.id}:${lessonId}`)) };
  const service = new LessonFilesService(prisma as unknown as PrismaService, curriculum as unknown as CurriculumService, learners as unknown as LearnerClassesService);
  return { service, store, audit, learners };
}

const filesOnDisk = () => readdir(dir);

describe('cleanFileName', () => {
  it.each([
    ['Bài 1.pdf', 'Bài 1.pdf'],
    ['C:\\Users\\gv\\Bài 1.pdf', 'Bài 1.pdf'],
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['a\u0000b\u202e.pdf', 'ab.pdf'],
    // macOS sends decomposed accents.
    ['Ba\u0300i.pdf', 'Bài.pdf'],
  ])('%j → %j', (name, cleaned) => {
    expect(cleanFileName(name)).toBe(cleaned);
  });

  it('keeps the extension of a long name', () => {
    const cleaned = cleanFileName(`${'a'.repeat(300)}.docx`);
    expect(cleaned.length).toBe(200);
    expect(cleaned.endsWith('.docx')).toBe(true);
  });
});

describe('contentDisposition', () => {
  it('sends an ASCII fallback and the UTF-8 name per RFC 5987', () => {
    expect(contentDisposition('inline', 'Bài "1" (mới).pdf')).toBe(`inline; filename="B_i _1_ (m_i).pdf"; filename*=UTF-8''B%C3%A0i%20%221%22%20%28m%E1%BB%9Bi%29.pdf`);
  });
});

describe('LessonFilesService.upload', () => {
  it('stores a PDF under a random UUID name and records it', async () => {
    const { service, store, audit } = setup();
    const file = await service.upload(teacher, 'l1', upload('Bài 1.pdf', PDF_BYTES));
    expect(file).toEqual({ id: 'f1', fileName: 'Bài 1.pdf', mimeType: PDF_TYPE, sizeBytes: PDF_BYTES.length, createdAt: CREATED_AT.toISOString() });
    const [name] = await filesOnDisk();
    expect(name).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.get('f1')?.storageKey).toBe(name);
    expect(await readFile(join(dir, name!))).toEqual(PDF_BYTES);
    expect(audit).toEqual([
      { actorId: 'gv-lan', action: 'lesson_file.uploaded', entityType: 'lesson_file', entityId: 'f1', metadata: { lessonId: 'l1', courseId: 'c1' } },
    ]);
  });

  it('accepts a DOCX', async () => {
    const { service } = setup();
    await expect(service.upload(teacher, 'l1', upload('Giáo án.docx', DOCX_BYTES))).resolves.toMatchObject({ mimeType: DOCX_TYPE });
  });

  it.each(['application/octet-stream', ''])('accepts a DOCX the browser sends as %j (no Office installed): the extension and bytes decide', async (type) => {
    const { service } = setup();
    await expect(service.upload(teacher, 'l1', upload('Giáo án.docx', DOCX_BYTES, type))).resolves.toMatchObject({ mimeType: DOCX_TYPE });
  });

  it.each([
    ['an .exe renamed to .pdf', upload('virus.pdf', EXE_BYTES)],
    ['an .exe renamed to .docx with a generic type', upload('virus.docx', EXE_BYTES, 'application/octet-stream')],
    ['a PDF named .docx', upload('a.docx', PDF_BYTES, DOCX_TYPE)],
    ['a PDF with the wrong type', upload('a.pdf', PDF_BYTES, 'text/html')],
    ['another extension', upload('a.zip', DOCX_BYTES, 'application/zip')],
    ['an empty file', upload('a.pdf', Buffer.alloc(0))],
  ])('400s for %s and writes nothing', async (_case, file) => {
    const { service } = setup();
    await expect(service.upload(teacher, 'l1', file)).rejects.toBeInstanceOf(BadRequestException);
    expect(await filesOnDisk()).toEqual([]);
  });

  it('400s without a file', async () => {
    const { service } = setup();
    await expect(service.upload(teacher, 'l1', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409s in an archived course and removes the written file', async () => {
    const { service } = setup({ editable: [] });
    await expect(service.upload(teacher, 'l1', upload('a.pdf', PDF_BYTES))).rejects.toBeInstanceOf(ConflictException);
    expect(await filesOnDisk()).toEqual([]);
  });

  it('409s for an 11th file', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      id: `old${i}`,
      lessonId: 'l1',
      fileName: `${i}.pdf`,
      mimeType: PDF_TYPE,
      sizeBytes: 1,
      storageKey: `k${i}`,
      createdAt: CREATED_AT,
    }));
    const { service } = setup({ files });
    await expect(service.upload(teacher, 'l1', upload('a.pdf', PDF_BYTES))).rejects.toBeInstanceOf(ConflictException);
    expect(await filesOnDisk()).toEqual([]);
  });

  it('removes the written file when the database insert fails', async () => {
    const { service } = setup({ failInsert: true });
    await expect(service.upload(teacher, 'l1', upload('a.pdf', PDF_BYTES))).rejects.toThrow('database is down');
    expect(await filesOnDisk()).toEqual([]);
  });
});

describe('LessonFilesService.open / remove', () => {
  async function uploaded() {
    const context = setup();
    const file = await context.service.upload(teacher, 'l1', upload('Bài 1.pdf', PDF_BYTES));
    return { ...context, file };
  }

  it('streams the stored bytes', async () => {
    const { service, file } = await uploaded();
    const opened = await service.open(teacher, file.id);
    expect(opened.file).toEqual(file);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks)).toEqual(PDF_BYTES);
  });

  it('404s for an unknown file, or one missing on disk', async () => {
    const { service, file } = await uploaded();
    await expect(service.open(teacher, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    for (const name of await filesOnDisk()) {
      await rm(join(dir, name));
    }
    await expect(service.open(teacher, file.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a student or parent open a PDF of a lesson open in one of their classes', async () => {
    const { service, file } = await uploaded();
    await expect(service.open(an, file.id)).resolves.toMatchObject({ file: { id: file.id } });
    await expect(service.open(hung, file.id)).resolves.toMatchObject({ file: { id: file.id } });
  });

  it('404s for a learner when the lesson is not open to them, without saying the file exists', async () => {
    const { service, file, learners } = await uploaded();
    await expect(service.open(minh, file.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(learners.canOpenLesson).toHaveBeenCalledWith(minh, 'l1');
  });

  it('never gives a learner a Word file, even of an open lesson, and does not look further', async () => {
    const { service, learners } = setup();
    const docx = await service.upload(teacher, 'l1', upload('Giáo án.docx', DOCX_BYTES));
    await expect(service.open(an, docx.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(learners.canOpenLesson).not.toHaveBeenCalled();
    await expect(service.open(teacher, docx.id)).resolves.toMatchObject({ file: { id: docx.id } });
  });

  it('treats someone who is staff and also a student as staff', async () => {
    const { service, learners } = setup();
    const docx = await service.upload(teacher, 'l1', upload('Giáo án.docx', DOCX_BYTES));
    await expect(service.open(learner('gv-x', ['TEACHER', 'STUDENT']), docx.id)).resolves.toMatchObject({ file: { id: docx.id } });
    expect(learners.canOpenLesson).not.toHaveBeenCalled();
  });

  it('deletes the record and the file, and audits it', async () => {
    const { service, store, audit, file } = await uploaded();
    await service.remove(teacher, file.id);
    expect(store.size).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
    expect(audit.at(-1)).toEqual({
      actorId: 'gv-lan',
      action: 'lesson_file.deleted',
      entityType: 'lesson_file',
      entityId: file.id,
      metadata: { lessonId: 'l1', courseId: 'c1' },
    });
    await expect(service.remove(teacher, file.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s when deleting from an archived course and keeps the file', async () => {
    const { service } = setup({
      files: [{ id: 'f', lessonId: 'archived', fileName: 'a.pdf', mimeType: PDF_TYPE, sizeBytes: 1, storageKey: 'k', createdAt: CREATED_AT }],
    });
    await expect(service.remove(teacher, 'f')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LessonFilesController', () => {
  it('lets staff and learners download, and only admins and teachers upload or delete', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LessonFilesController)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES']);
    expect(Reflect.getMetadata(ROLES_KEY, LessonFilesController.prototype.download)).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES', 'STUDENT', 'PARENT']);
    for (const method of ['upload', 'remove'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, LessonFilesController.prototype[method])).toEqual(['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER']);
    }
  });
});
