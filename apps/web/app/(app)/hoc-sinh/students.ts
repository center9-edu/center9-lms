import { fetchApiJson } from '../../lib/api';
import type { UserStatus } from '../quan-tri/tai-khoan/users';

// Server-only: import this file only from Server Components and Server Actions.

export interface StudentSummary {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  studentCode: string | null;
  schoolName: string | null;
}

export interface StudentProfile {
  studentCode: string;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  schoolName: string | null;
  notes: string | null;
}

export type Relationship = 'FATHER' | 'MOTHER' | 'GRANDFATHER' | 'GRANDMOTHER' | 'OTHER';

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  FATHER: 'Bố',
  MOTHER: 'Mẹ',
  GRANDFATHER: 'Ông',
  GRANDMOTHER: 'Bà',
  OTHER: 'Khác',
};

export interface Guardian {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  /** The linked PARENT account, if any. */
  username: string | null;
}

export interface StudentGuardian {
  guardianId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  relationship: Relationship;
  isPrimaryContact: boolean;
}

export interface StudentDetail {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  profile: StudentProfile | null;
  /** Primary contact first. */
  guardians: StudentGuardian[];
}

export const fetchStudents = () => fetchApiJson<StudentSummary[]>('/students');

export const fetchStudent = (userId: string) => fetchApiJson<StudentDetail>(`/students/${encodeURIComponent(userId)}`);

export const fetchGuardians = () => fetchApiJson<Guardian[]>('/guardians');
