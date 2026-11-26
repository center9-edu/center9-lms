import { fetchApiJson } from '../../lib/api';
import type { BadgeTone } from '../../ui/badge';

// Server-only: import this file only from Server Components and Server Actions.

export type ClassStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Mở đăng ký',
  IN_PROGRESS: 'Đang học',
  COMPLETED: 'Đã kết thúc',
  CANCELLED: 'Đã huỷ',
};

export const CLASS_STATUS_TONES: Record<ClassStatus, BadgeTone> = {
  DRAFT: 'muted',
  OPEN: 'primary',
  IN_PROGRESS: 'success',
  COMPLETED: 'muted',
  CANCELLED: 'danger',
};

/** The button that moves a class to each status. */
export const STATUS_ACTION_LABELS: Record<ClassStatus, string> = {
  DRAFT: 'Về nháp',
  OPEN: 'Mở đăng ký',
  IN_PROGRESS: 'Bắt đầu học',
  COMPLETED: 'Kết thúc lớp',
  CANCELLED: 'Huỷ lớp',
};

export type TeacherRole = 'MAIN_TEACHER' | 'ASSISTANT';

export const TEACHER_ROLE_LABELS: Record<TeacherRole, string> = {
  MAIN_TEACHER: 'Giáo viên chính',
  ASSISTANT: 'Trợ giảng',
};

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'REMOVED';

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Đang học',
  COMPLETED: 'Hoàn thành',
  DROPPED: 'Đã nghỉ học',
  REMOVED: 'Đã rút khỏi lớp',
};

export const ENROLLMENT_STATUS_TONES: Record<EnrollmentStatus, BadgeTone> = {
  ACTIVE: 'success',
  COMPLETED: 'primary',
  DROPPED: 'muted',
  REMOVED: 'warning',
};

/** The button that moves a student to each status. */
export const ENROLLMENT_ACTION_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Khôi phục',
  COMPLETED: 'Hoàn thành',
  DROPPED: 'Nghỉ học',
  REMOVED: 'Rút khỏi lớp',
};

export interface Enrollment {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  leftAt: string | null;
  nextStatuses: EnrollmentStatus[];
}

export interface ClassSummary {
  id: string;
  code: string;
  name: string;
  status: ClassStatus;
  course: { id: string; title: string; slug: string };
  /** YYYY-MM-DD. */
  startDate: string | null;
  endDate: string | null;
  capacity: number | null;
  activeStudentCount: number;
  nextStatuses: ClassStatus[];
  /** Main teacher first. */
  teachers: { userId: string; teacherCode: string; fullName: string; role: TeacherRole }[];
}

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: 'Đã lên lịch',
  COMPLETED: 'Đã dạy',
  CANCELLED: 'Đã huỷ',
};

export const SESSION_STATUS_TONES: Record<SessionStatus, BadgeTone> = {
  SCHEDULED: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export interface ClassSession {
  id: string;
  /** Among the sessions that are not cancelled; null when cancelled. */
  number: number | null;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  /** The part this session teaches, worked out by the API from the curriculum as it is now. */
  lesson: { id: string; title: string; partNumber: number; partCount: number } | null;
}

export interface ClassDetail extends ClassSummary {
  sessions: ClassSession[];
  totalParts: number;
  missingSessions: number;
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'EXCUSED' | 'ABSENT';

/** In the order the form offers them. */
export const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string; tone: BadgeTone }[] = [
  { value: 'PRESENT', label: 'Có mặt', tone: 'success' },
  { value: 'LATE', label: 'Đi muộn', tone: 'warning' },
  { value: 'EXCUSED', label: 'Vắng có phép', tone: 'primary' },
  { value: 'ABSENT', label: 'Vắng', tone: 'danger' },
];

export interface AttendanceSheet {
  sessionId: string;
  classCode: string;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  /** 15 minutes before the start. */
  opensAt: string;
  editable: boolean;
  taughtBy: { userId: string; fullName: string } | null;
  teacherOptions: { userId: string; teacherCode: string; fullName: string }[];
  students: {
    enrollmentId: string;
    studentCode: string;
    fullName: string;
    enrollmentStatus: EnrollmentStatus;
    status: AttendanceStatus | null;
    note: string | null;
  }[];
}

/** "2026-12-01" → "01/12/2026"; a calendar date, so no time zone is involved. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

export function formatDateRange({ startDate, endDate }: Pick<ClassSummary, 'startDate' | 'endDate'>): string {
  if (!startDate && !endDate) {
    return 'Chưa có ngày';
  }
  return `${startDate ? formatDay(startDate) : '?'} – ${endDate ? formatDay(endDate) : '?'}`;
}

export const formatCapacity = ({ activeStudentCount, capacity }: Pick<ClassSummary, 'activeStudentCount' | 'capacity'>): string =>
  capacity === null ? `${activeStudentCount} học sinh (không giới hạn)` : `${activeStudentCount}/${capacity} học sinh`;

export const fetchClasses = () => fetchApiJson<ClassSummary[]>('/classes');

export const fetchEnrollments = (classId: string) => fetchApiJson<Enrollment[]>(`/classes/${encodeURIComponent(classId)}/enrollments`);

export const fetchAttendance = (sessionId: string) => fetchApiJson<AttendanceSheet>(`/class-sessions/${encodeURIComponent(sessionId)}/attendance`);

export const fetchClass = (code: string) => fetchApiJson<ClassDetail>(`/classes/${encodeURIComponent(code)}`);
