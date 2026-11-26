import { z } from 'zod';
import { optionalText } from '../parse-body.js';
import { AttendanceStatus, ClassSessionStatus, ClassStatus, ClassTeacherRole, EnrollmentStatus } from '@center9/database';

const MAX_NAME_LENGTH = 150;
// ponytail: far above a real class; only stops a typo like 1000.
const MAX_CAPACITY = 500;

const NAME_ERROR = `name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`;
const CAPACITY_ERROR = `capacity must be a whole number from 1 to ${MAX_CAPACITY} or null`;

const name = z.string(NAME_ERROR).trim().min(1, NAME_ERROR).max(MAX_NAME_LENGTH, NAME_ERROR);
const optionalDate = (field: string) =>
  z.iso
    .date(`${field} must be a date in YYYY-MM-DD format or null`)
    .nullish()
    .transform((value) => value ?? null);

const editableFields = z.object({
  name,
  startDate: optionalDate('startDate'),
  endDate: optionalDate('endDate'),
  capacity: z.int(CAPACITY_ERROR).min(1, CAPACITY_ERROR).max(MAX_CAPACITY, CAPACITY_ERROR).nullish().transform((value) => value ?? null),
});

// ISO dates compare correctly as strings. The database checks it too (classes_date_range_check).
const datesInOrder = ({ startDate, endDate }: { startDate: string | null; endDate: string | null }) => !startDate || !endDate || endDate >= startDate;
const DATES_ERROR = 'endDate must not be before startDate';

/** PUT replaces the editable fields: one left out is cleared. The course is fixed once the class exists. */
export const updateClassSchema = editableFields.refine(datesInOrder, DATES_ERROR);
export const createClassSchema = editableFields.extend({ courseId: z.uuid('courseId must be an id') }).refine(datesInOrder, DATES_ERROR);

export const classStatusSchema = z.object({ status: z.enum(ClassStatus, `status must be one of: ${Object.values(ClassStatus).join(', ')}`) });

export const teacherRoleSchema = z.object({ role: z.enum(ClassTeacherRole, `role must be one of: ${Object.values(ClassTeacherRole).join(', ')}`) });

export const enrollSchema = z.object({ studentId: z.uuid('studentId must be an id') });
export const enrollmentStatusSchema = z.object({
  status: z.enum(EnrollmentStatus, `status must be one of: ${Object.values(EnrollmentStatus).join(', ')}`),
});

const TIME_ERROR = 'times must be HH:MM, from 00:00 to 23:59';
const time = z.string(TIME_ERROR).regex(/^([01]\d|2[0-3]):[0-5]\d$/, TIME_ERROR);
// HH:MM strings compare correctly as text; the database checks it too (class_sessions_time_range_check).
const timesInOrder = ({ startTime, endTime }: { startTime: string; endTime: string }) => endTime > startTime;
const TIMES_ERROR = 'endTime must be after startTime';
const WEEKDAYS_ERROR = 'weekdays must list 1 (Monday) to 7 (Sunday), each at most once';

/** A weekly schedule; one session is made per curriculum part. Weekdays: 1 = Monday ("Thứ 2") … 7 = Sunday. */
export const scheduleSchema = z
  .object({
    startDate: z.iso.date('startDate must be a date in YYYY-MM-DD format'),
    weekdays: z
      .array(z.int(WEEKDAYS_ERROR).min(1, WEEKDAYS_ERROR).max(7, WEEKDAYS_ERROR), WEEKDAYS_ERROR)
      .min(1, WEEKDAYS_ERROR)
      .refine((days) => new Set(days).size === days.length, WEEKDAYS_ERROR),
    startTime: time,
    endTime: time,
  })
  .refine(timesInOrder, TIMES_ERROR);

/** One session's day and times, in Vietnam. */
export const sessionTimesSchema = z
  .object({ date: z.iso.date('date must be a date in YYYY-MM-DD format'), startTime: time, endTime: time })
  .refine(timesInOrder, TIMES_ERROR);

const MAX_NOTE_LENGTH = 500;
// ponytail: far above a real class; only stops a runaway request.
const MAX_RECORDS = 200;
const STATUS_ERROR = `status must be one of: ${Object.values(AttendanceStatus).join(', ')}`;

/** One session's marks: only the students listed change. `taughtBy` records a substitute; left out, it stays. */
export const attendanceSchema = z.object({
  records: z
    .array(
      z.object({
        enrollmentId: z.uuid('enrollmentId must be an id'),
        status: z.enum(AttendanceStatus, STATUS_ERROR),
        note: optionalText('note', MAX_NOTE_LENGTH),
      }),
      'records must be a list',
    )
    .max(MAX_RECORDS),
  taughtBy: z.uuid('taughtBy must be an id').optional(),
});

export type AttendanceInput = z.output<typeof attendanceSchema>;
export type ScheduleInput = z.output<typeof scheduleSchema>;
export type SessionTimesInput = z.output<typeof sessionTimesSchema>;

export type CreateClassInput = z.output<typeof createClassSchema>;
export type UpdateClassInput = z.output<typeof updateClassSchema>;

export interface ClassDto {
  id: string;
  /** LH0001, …: the key in page URLs. */
  code: string;
  name: string;
  status: ClassStatus;
  course: { id: string; title: string; slug: string };
  startDate: string | null;
  endDate: string | null;
  /** null: no limit. */
  capacity: number | null;
  activeStudentCount: number;
  /** What setStatus accepts from here; empty once the class is finished or cancelled. */
  nextStatuses: ClassStatus[];
  /** Main teacher first (at most one), then assistants in the order they were assigned. */
  teachers: { userId: string; teacherCode: string; fullName: string; role: ClassTeacherRole }[];
}

/** A student in a class, for staff and the class's teachers; never sent to students or parents. */
export interface EnrollmentDto {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  /** Set while DROPPED or REMOVED. */
  leftAt: string | null;
  /** What setStatus accepts from here: empty once COMPLETED or DROPPED. */
  nextStatuses: EnrollmentStatus[];
}

export interface ClassSessionDto {
  id: string;
  /** 1, 2, … among the sessions that are not cancelled, in time order; null when cancelled. */
  number: number | null;
  startsAt: string;
  endsAt: string;
  status: ClassSessionStatus;
  /** The curriculum part this session teaches, worked out on every read; null when cancelled or beyond the last part. */
  lesson: { id: string; title: string; partNumber: number; partCount: number } | null;
}

/** A class with its sessions, for the class page. */
export interface ClassDetailDto extends ClassDto {
  /** In time order. */
  sessions: ClassSessionDto[];
  /** How many sessions the curriculum needs: the parts of all its lessons. */
  totalParts: number;
  /** Parts that no session teaches yet. */
  missingSessions: number;
}

/**
 * A class as a student or parent sees it: no capacity, no classmates, no staff notes. `students` names only the
 * learner (or the parent's own children) in this class.
 */
export interface LearnerClassDto {
  code: string;
  name: string;
  status: ClassStatus;
  courseTitle: string;
  startDate: string | null;
  endDate: string | null;
  teachers: { fullName: string; role: ClassTeacherRole }[];
  students: string[];
}

export interface LearnerClassDetailDto extends LearnerClassDto {
  /** In time order; a lesson is `unlocked` from the day of the session that teaches its first part. */
  sessions: {
    number: number | null;
    startsAt: string;
    endsAt: string;
    status: ClassSessionStatus;
    lesson: { id: string; title: string; partNumber: number; partCount: number; unlocked: boolean } | null;
    /** The learner's own mark, or each of the parent's children's; never a classmate's, never the teacher's note. */
    attendance: { student: string; status: AttendanceStatus }[];
  }[];
  /** Per learner: sessions present or late, over the sessions marked so far. */
  attendance: { student: string; attended: number; marked: number }[];
  /** Unlocked lessons in session order, with their PDF files: the only files a learner can open. */
  openLessons: { id: string; title: string; files: { id: string; fileName: string; sizeBytes: number }[] }[];
}

/** One session's attendance sheet, for staff and the class's teachers. */
export interface AttendanceSheetDto {
  sessionId: string;
  classCode: string;
  startsAt: string;
  endsAt: string;
  status: ClassSessionStatus;
  /** 15 minutes before the start: marking is possible from then on (agreed 2026-11-26). */
  opensAt: string;
  /** True for a teacher of the class once attendance is open, while the session and class are not closed. */
  editable: boolean;
  taughtBy: { userId: string; fullName: string } | null;
  /** Active teachers, to record a substitute; empty unless editable. */
  teacherOptions: { userId: string; teacherCode: string; fullName: string }[];
  /** Active students, and anyone already marked in this session. */
  students: {
    enrollmentId: string;
    studentCode: string;
    fullName: string;
    enrollmentStatus: EnrollmentStatus;
    status: AttendanceStatus | null;
    note: string | null;
  }[];
}
