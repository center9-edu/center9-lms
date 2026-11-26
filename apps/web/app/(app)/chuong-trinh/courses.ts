import { fetchApiJson } from '../../lib/api';

// Server-only: import this file only from Server Components and Server Actions.

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  /** One of COURSE_SUBJECTS in ./course-options. */
  subject: string;
  /** One of COURSE_LEVELS in ./course-options. */
  level: string;
  archived: boolean;
}

export interface LessonFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Lesson {
  id: string;
  title: string;
  position: number;
  partCount: number;
  files: LessonFile[];
}

export interface Chapter {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}

/** A course with the chapter/lesson tree every class of it follows. */
export interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  subject: string;
  level: string;
  archivedAt: string | null;
  createdAt: string;
  chapters: Chapter[];
}

export const fetchCourses = () => fetchApiJson<CourseSummary[]>('/courses');

export const fetchCourse = (slug: string) => fetchApiJson<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
