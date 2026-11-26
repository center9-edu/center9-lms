import { fetchApiJson } from '../../lib/api';
import type { AttendanceStatus, ClassStatus, SessionStatus, TeacherRole } from './classes';

// Server-only: import this file only from Server Components. What a student or parent sees of a class.

export interface LearnerClass {
  code: string;
  name: string;
  status: ClassStatus;
  courseTitle: string;
  startDate: string | null;
  endDate: string | null;
  teachers: { fullName: string; role: TeacherRole }[];
  /** The learner, or the parent's own children, in this class. */
  students: string[];
}

export interface LearnerSession {
  number: number | null;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  lesson: { id: string; title: string; partNumber: number; partCount: number; unlocked: boolean } | null;
  /** The learner's own mark, or each of the parent's children's. */
  attendance: { student: string; status: AttendanceStatus }[];
}

export interface LearnerClassDetail extends LearnerClass {
  sessions: LearnerSession[];
  /** Open lessons with their PDFs: the only files a learner can open. */
  openLessons: { id: string; title: string; files: { id: string; fileName: string; sizeBytes: number }[] }[];
  /** Per learner: present or late, over the sessions marked. */
  attendance: { student: string; attended: number; marked: number }[];
}

export const fetchLearnerClasses = () => fetchApiJson<LearnerClass[]>('/learner/classes');

export const fetchLearnerClass = (code: string) => fetchApiJson<LearnerClassDetail>(`/learner/classes/${encodeURIComponent(code)}`);
