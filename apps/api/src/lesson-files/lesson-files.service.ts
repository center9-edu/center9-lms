import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LessonAttachment, Role } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { LearnerClassesService } from '../classes/learner-classes.service.js';
import { CurriculumService } from '../courses/curriculum.service.js';
import { PrismaService } from '../prisma.service.js';

// Agreed 2026-11-17: PDF and DOCX, 20 MB each, 10 per lesson.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_LESSON = 10;
const MAX_FILE_NAME_LENGTH = 200;
export const PDF_TYPE = 'application/pdf';
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Staff open any lesson file, as on the curriculum pages; everyone else is a learner (see open). */
const STAFF: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES'];

// The extension, the browser's type and the first bytes must all agree. A browser without the type registered
// (a DOCX on a PC without Office) sends a generic or no type: then the extension and the bytes decide.
const GENERIC_TYPES = new Set(['', 'application/octet-stream']);
const KINDS = [
  { extension: '.pdf', mimeType: PDF_TYPE, magic: Buffer.from('%PDF-') },
  // A DOCX is a zip archive.
  { extension: '.docx', mimeType: DOCX_TYPE, magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
];

/**
 * A lesson file as this module returns it. Its own type (CLAUDE.md §5: no importing another feature's internal
 * files); the curriculum tree in courses carries the same fields.
 */
export interface LessonFileDto {
  id: string;
  fileName: string;
  /** application/pdf (viewed in the page) or the DOCX type (downloaded). */
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** What multer hands over with in-memory storage (no @types/multer needed for these fields). */
export interface UploadedLessonFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** The name to show and download as: no folders, no control characters, composed accents, at most 200 characters with the extension kept. */
export function cleanFileName(name: string): string {
  const base = name.normalize('NFC').split(/[\\/]/).pop() ?? '';
  return base
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(-MAX_FILE_NAME_LENGTH);
}

/** RFC 6266 header: an ASCII fallback name, plus the real name UTF-8 encoded as RFC 5987 asks. */
export function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function toDto(file: LessonAttachment): LessonFileDto {
  return { id: file.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: file.createdAt.toISOString() };
}

// ponytail: files on this server's disk work for one API instance; move to object storage before running several.
function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) {
    throw new Error('UPLOAD_DIR is not set');
  }
  return dir;
}

@Injectable()
export class LessonFilesService {
  private readonly logger = new Logger(LessonFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly curriculum: CurriculumService,
    private readonly learners: LearnerClassesService,
  ) {}

  /** Writes the file first, then records it; if recording fails the file is removed again. */
  async upload(actor: AuthContext, lessonId: string, upload: UploadedLessonFile | undefined): Promise<LessonFileDto> {
    if (!upload) {
      throw new BadRequestException('file is required');
    }
    const fileName = cleanFileName(upload.originalname);
    const kind = KINDS.find(({ extension }) => fileName.toLowerCase().endsWith(extension));
    if (!kind || (upload.mimetype !== kind.mimeType && !GENERIC_TYPES.has(upload.mimetype)) || !upload.buffer.subarray(0, kind.magic.length).equals(kind.magic)) {
      throw new BadRequestException('Only PDF and DOCX files are accepted');
    }

    const dir = uploadDir();
    const storageKey = randomUUID();
    const path = join(dir, storageKey);
    await mkdir(dir, { recursive: true });
    await writeFile(path, upload.buffer, { flag: 'wx' });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const courseId = await this.curriculum.lockLessonCourse(tx, lessonId);
        if ((await tx.lessonAttachment.count({ where: { lessonId } })) >= MAX_FILES_PER_LESSON) {
          throw new ConflictException(`A lesson has at most ${MAX_FILES_PER_LESSON} files`);
        }
        const file = await tx.lessonAttachment.create({
          data: { lessonId, fileName, mimeType: kind.mimeType, sizeBytes: upload.size, storageKey, uploadedById: actor.user.id },
        });
        await tx.auditLog.create({
          data: { actorId: actor.user.id, action: 'lesson_file.uploaded', entityType: 'lesson_file', entityId: file.id, metadata: { lessonId, courseId } },
        });
        return toDto(file);
      });
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }

  /**
   * Staff open any file. A student or parent opens only a PDF of a lesson that is open today in one of their
   * classes (agreed 2026-11-26); anything else is the same 404 as an unknown id, so a guessed id tells nothing.
   */
  async open(actor: AuthContext, fileId: string): Promise<{ file: LessonFileDto; stream: ReadStream }> {
    const file = await this.prisma.lessonAttachment.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException();
    }
    const isStaff = actor.user.roles.some((role) => STAFF.includes(role));
    // The type check goes first: it is free, and a Word file is never for a learner whatever the lesson.
    // ponytail: the 404s take different amounts of work (unknown or Word: 1 query; a PDF: more), so timing could tell
    // a locked PDF of the learner's own course from an unknown id. Accepted (security review 2026-11-26): ids are
    // random UUIDs and learners only ever receive ids of open PDFs. One combined query closes it if that changes.
    if (!isStaff && (file.mimeType !== PDF_TYPE || !(await this.learners.canOpenLesson(actor, file.lessonId)))) {
      throw new NotFoundException();
    }
    try {
      const handle = await open(join(uploadDir(), file.storageKey));
      return { file: toDto(file), stream: handle.createReadStream() };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // The record outlived its bytes (lost disk, restore without UPLOAD_DIR): worth an operator's look.
      this.logger.error(`Lesson file ${file.id} is missing on disk`);
      throw new NotFoundException();
    }
  }

  /** Removes the record, then the bytes; a file left behind on disk is harmless, a record without bytes is not. */
  async remove(actor: AuthContext, fileId: string): Promise<void> {
    const storageKey = await this.prisma.$transaction(async (tx) => {
      const file = await tx.lessonAttachment.findUnique({ where: { id: fileId } });
      if (!file) {
        throw new NotFoundException();
      }
      const courseId = await this.curriculum.lockLessonCourse(tx, file.lessonId);
      // Another request may have deleted it while we waited for the lock.
      if ((await tx.lessonAttachment.deleteMany({ where: { id: fileId } })).count === 0) {
        throw new NotFoundException();
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.user.id,
          action: 'lesson_file.deleted',
          entityType: 'lesson_file',
          entityId: fileId,
          metadata: { lessonId: file.lessonId, courseId },
        },
      });
      return file.storageKey;
    });
    try {
      await rm(join(uploadDir(), storageKey), { force: true });
    } catch {
      this.logger.warn(`Could not remove the bytes of deleted lesson file ${fileId}`);
    }
  }
}
