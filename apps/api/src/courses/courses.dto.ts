import { z } from 'zod';
import { optionalText } from '../parse-body.js';

const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 2_000;
export const MAX_SLUG_LENGTH = 60;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TITLE_ERROR = `title must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters`;
const SLUG_ERROR = `slug must be at most ${MAX_SLUG_LENGTH} lowercase letters or digits, in words joined by single "-"`;

const title = z.string(TITLE_ERROR).trim().min(1, TITLE_ERROR).max(MAX_TITLE_LENGTH, TITLE_ERROR);
const description = optionalText('description', MAX_DESCRIPTION_LENGTH);

/** Agreed 2026-11-26: every course has exactly one of these; the web shows Cơ bản, Trung cấp, Nâng cao. */
export const COURSE_LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const;
const level = z.enum(COURSE_LEVELS, `level must be one of: ${COURSE_LEVELS.join(', ')}`);

/** Agreed 2026-11-26: every course has exactly one of these; the web calls it "Nhóm". */
export const COURSE_SUBJECTS = ['SCRATCH', 'PYTHON', 'WEB', 'ROBOTICS'] as const;
const subject = z.enum(COURSE_SUBJECTS, `subject must be one of: ${COURSE_SUBJECTS.join(', ')}`);

export const createCourseSchema = z.object({ title, description, subject, level });

/** PUT replaces the editable fields; a description left out is cleared. */
export const updateCourseSchema = z.object({
  title,
  description,
  subject,
  level,
  slug: z.string(SLUG_ERROR).max(MAX_SLUG_LENGTH, SLUG_ERROR).regex(SLUG_PATTERN, SLUG_ERROR),
});

const MAX_PART_COUNT = 50;
const PART_COUNT_ERROR = `partCount must be a whole number from 1 to ${MAX_PART_COUNT}`;
// ponytail: far above any real chapter or lesson count; only stops a runaway request.
const MAX_ORDERED_ITEMS = 500;

/** Chapters have only a title. */
export const chapterSchema = z.object({ title });
export const lessonSchema = z.object({ title, partCount: z.int(PART_COUNT_ERROR).min(1, PART_COUNT_ERROR).max(MAX_PART_COUNT, PART_COUNT_ERROR) });
/** The new order: every chapter of the course (or lesson of the chapter), each once. */
export const orderSchema = z.object({ ids: z.array(z.uuid('ids must be a list of ids'), 'ids must be a list of ids').max(MAX_ORDERED_ITEMS) });

export type CreateCourseInput = z.output<typeof createCourseSchema>;
export type UpdateCourseInput = z.output<typeof updateCourseSchema>;
export type ChapterInput = z.output<typeof chapterSchema>;
export type LessonInput = z.output<typeof lessonSchema>;

export interface CourseSummaryDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  /** One of COURSE_SUBJECTS. */
  subject: string;
  /** One of COURSE_LEVELS. */
  level: string;
  archived: boolean;
}

export interface LessonFileDto {
  id: string;
  fileName: string;
  /** application/pdf (viewed in the page) or the DOCX type (downloaded). */
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface LessonSummaryDto {
  id: string;
  title: string;
  position: number;
  partCount: number;
  /** Oldest first. */
  files: LessonFileDto[];
}

export interface ChapterDto {
  id: string;
  title: string;
  position: number;
  /** By position. */
  lessons: LessonSummaryDto[];
}

/** A course with its chapter/lesson tree, which every class of the course follows. */
export interface CourseDetailDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  /** One of COURSE_SUBJECTS. */
  subject: string;
  /** One of COURSE_LEVELS. */
  level: string;
  archivedAt: string | null;
  createdAt: string;
  /** By position. */
  chapters: ChapterDto[];
}
