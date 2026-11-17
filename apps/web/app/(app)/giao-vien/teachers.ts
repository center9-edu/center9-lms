import { fetchApiJson } from '../../lib/api';
import type { UserStatus } from '../quan-tri/tai-khoan/users';

// Server-only: import this file only from Server Components and Server Actions.

export interface TeacherSummary {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  teacherCode: string | null;
}

export interface TeacherDetail {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  profile: { teacherCode: string; bio: string | null } | null;
}

export const fetchTeachers = () => fetchApiJson<TeacherSummary[]>('/teachers');

export const fetchTeacher = (userId: string) => fetchApiJson<TeacherDetail>(`/teachers/${encodeURIComponent(userId)}`);
