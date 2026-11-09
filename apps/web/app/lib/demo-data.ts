// DEMO ONLY: classes, sessions and attendance have no API yet. Everything here is fake and lives only in memory.
// Replace with API calls once the classes module exists; deleting this file shows every page that still uses it.
// Types mirror the enums in packages/database/prisma/schema.prisma (apps/web cannot import @center9/database).
// Fake people only: teacher and student names match the accounts in apps/api/src/scripts/seed.ts or are made up.
import type { BadgeTone } from '../ui/badge';
import type { Role, SessionUser } from './session';

export type ClassStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ClassTeacherRole = 'MAIN_TEACHER' | 'ASSISTANT';
export type ClassSessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface DemoPerson {
  username: string;
  fullName: string;
}

export interface DemoSession {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  status: ClassSessionStatus;
  /** Only for completed sessions, keyed by student username. */
  attendance: Record<string, AttendanceStatus>;
}

export interface DemoClass {
  code: string;
  name: string;
  course: string;
  status: ClassStatus;
  capacity: number;
  teachers: (DemoPerson & { roleInClass: ClassTeacherRole })[];
  students: DemoPerson[];
  sessions: DemoSession[];
}

export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Sắp khai giảng',
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

export const SESSION_STATUS_LABELS: Record<ClassSessionStatus, string> = {
  SCHEDULED: 'Sắp diễn ra',
  COMPLETED: 'Đã học',
  CANCELLED: 'Đã huỷ',
};

export const SESSION_STATUS_TONES: Record<ClassSessionStatus, BadgeTone> = { SCHEDULED: 'primary', COMPLETED: 'muted', CANCELLED: 'danger' };

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Có mặt',
  LATE: 'Đi muộn',
  EXCUSED: 'Vắng có phép',
  ABSENT: 'Vắng',
};

export const TEACHER_ROLE_LABELS: Record<ClassTeacherRole, string> = {
  MAIN_TEACHER: 'Giáo viên chính',
  ASSISTANT: 'Trợ giảng',
};

/** Who may open the class pages. Teachers see only their own classes (see classesFor). */
export const CLASS_ROLES: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES', 'TEACHER'];

const LAN = { username: 'gv.lan', fullName: 'Trần Thị Lan' };
const NAM = { username: 'gv.nam', fullName: 'Phạm Văn Nam' };
const MINH = { username: 'hs.minh', fullName: 'Nguyễn Văn Minh' };
const AN = { username: 'hs.an', fullName: 'Lê Bảo An' };
const KHOA = { username: 'hs.khoa', fullName: 'Đặng Minh Khoa' };
const VY = { username: 'hs.vy', fullName: 'Hoàng Tường Vy' };
const PHUC = { username: 'hs.phuc', fullName: 'Vũ Gia Phúc' };
const LINH = { username: 'hs.linh', fullName: 'Bùi Khánh Linh' };
const DUY = { username: 'hs.duy', fullName: 'Ngô Đức Duy' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date in Vietnam as YYYY-MM-DD, whatever the server's time zone. */
export function vnDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

// Repeating pattern so attendance looks varied but stays deterministic.
const PATTERN: AttendanceStatus[] = ['PRESENT', 'PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'EXCUSED', 'PRESENT', 'ABSENT'];

interface ClassSpec extends Omit<DemoClass, 'sessions'> {
  titles: string[];
  /** Days from today to the first session; one session per week after that. */
  firstOffset: number;
  time: [string, string];
  location: string;
}

function buildClass({ titles, firstOffset, time, location, ...spec }: ClassSpec, now: Date): DemoClass {
  const today = vnDate(now);
  const at = (dayOffset: number, clock: string) => new Date(new Date(`${today}T${clock}:00+07:00`).getTime() + dayOffset * DAY_MS);
  const sessions = titles.map((title, index): DemoSession => {
    const startsAt = at(firstOffset + index * 7, time[0]);
    const done = startsAt.getTime() < now.getTime() - 2 * 60 * 60 * 1000;
    return {
      id: `${spec.code}-${index + 1}`,
      title,
      startsAt,
      endsAt: at(firstOffset + index * 7, time[1]),
      location,
      status: done ? 'COMPLETED' : 'SCHEDULED',
      attendance: done
        ? Object.fromEntries(spec.students.map((student, i) => [student.username, PATTERN[(i * 3 + index) % PATTERN.length]]))
        : {},
    };
  });
  return { ...spec, sessions };
}

const PYTHON_BASICS = [
  'Làm quen với Python',
  'Biến và kiểu dữ liệu',
  'Nhập và xuất dữ liệu',
  'Câu lệnh if',
  'Vòng lặp for',
  'Vòng lặp while',
  'Danh sách (list)',
  'Dự án nhỏ: trò chơi đoán số',
];

const CLASS_SPECS: ClassSpec[] = [
  {
    code: 'PY-K12-01',
    name: 'Python cơ bản – K12',
    course: 'Lập trình Python cơ bản',
    status: 'IN_PROGRESS',
    capacity: 12,
    teachers: [
      { ...LAN, roleInClass: 'MAIN_TEACHER' },
      { ...NAM, roleInClass: 'ASSISTANT' },
    ],
    students: [MINH, AN, KHOA, VY, PHUC],
    titles: PYTHON_BASICS,
    firstOffset: -35,
    time: ['18:00', '19:30'],
    location: 'Phòng 201',
  },
  {
    code: 'SCR-K08-02',
    name: 'Scratch sáng tạo – K08',
    course: 'Lập trình Scratch',
    status: 'IN_PROGRESS',
    capacity: 10,
    teachers: [{ ...NAM, roleInClass: 'MAIN_TEACHER' }],
    students: [AN, LINH, DUY, VY],
    titles: ['Nhân vật và sân khấu', 'Chuyển động', 'Sự kiện và điều khiển', 'Biến và điểm số', 'Trò chơi bắt bóng', 'Trình bày sản phẩm'],
    firstOffset: -20,
    time: ['09:00', '10:30'],
    location: 'Phòng 102',
  },
  {
    code: 'PY-K12-03',
    name: 'Python nâng cao – K12',
    course: 'Lập trình Python nâng cao',
    status: 'OPEN',
    capacity: 12,
    teachers: [{ ...LAN, roleInClass: 'MAIN_TEACHER' }],
    students: [MINH, KHOA, PHUC],
    titles: ['Hàm', 'Từ điển (dict)', 'Làm việc với tệp', 'Dự án: sổ điểm'],
    firstOffset: 10,
    time: ['18:00', '19:30'],
    location: 'Phòng 201',
  },
  {
    code: 'WEB-K14-01',
    name: 'Làm web với HTML/CSS – K14',
    course: 'Thiết kế web cơ bản',
    status: 'COMPLETED',
    capacity: 12,
    teachers: [{ ...LAN, roleInClass: 'MAIN_TEACHER' }],
    students: [MINH, LINH, DUY],
    titles: ['Trang web đầu tiên', 'Văn bản và hình ảnh', 'CSS cơ bản', 'Bố cục trang', 'Dự án: trang giới thiệu bản thân'],
    firstOffset: -80,
    time: ['14:00', '15:30'],
    location: 'Phòng 103',
  },
];

/** Built per call, so "today" and session statuses follow the real date even on a long-running server. */
export function demoClasses(now = new Date()): DemoClass[] {
  return CLASS_SPECS.map((spec) => buildClass(spec, now));
}

/** Staff see every class; a user who is only a teacher sees the classes they teach. */
export function seesAllClasses(user: SessionUser): boolean {
  return user.roles.some((role) => role === 'SUPER_ADMIN' || role === 'CENTER_ADMIN' || role === 'SALES');
}

/** Mirrors what the future API should return for this user. */
export function classesFor(user: SessionUser, now = new Date()): DemoClass[] {
  return seesAllClasses(user) ? demoClasses(now) : classesTaughtBy(user.username, now);
}

export function nextSession(demoClass: DemoClass): DemoSession | undefined {
  return demoClass.sessions.find((session) => session.status === 'SCHEDULED');
}

/** Fake guardian links (schema: StudentGuardian). Keyed by parent username. */
export const DEMO_CHILDREN: Record<string, DemoPerson[]> = {
  'ph.hung': [MINH],
};

export function classesTaughtBy(username: string, now = new Date()): DemoClass[] {
  return demoClasses(now).filter((demoClass) => demoClass.teachers.some((teacher) => teacher.username === username));
}

export function classesOf(studentUsername: string, now = new Date()): DemoClass[] {
  return demoClasses(now).filter((demoClass) => demoClass.students.some((student) => student.username === studentUsername));
}

/** Present or late counts as attended; only sessions that already have attendance are counted. */
export function attendanceOf(studentUsername: string, now = new Date()): { attended: number; total: number } {
  const marks = classesOf(studentUsername, now)
    .flatMap((demoClass) => demoClass.sessions)
    .map((session) => session.attendance[studentUsername])
    .filter((status) => status !== undefined);
  return { attended: marks.filter((status) => status === 'PRESENT' || status === 'LATE').length, total: marks.length };
}

export interface UpcomingSession {
  demoClass: DemoClass;
  session: DemoSession;
}

/** Scheduled sessions from the start of today, soonest first. */
export function upcomingSessions(classes: DemoClass[], limit: number, now = new Date()): UpcomingSession[] {
  const startOfToday = new Date(`${vnDate(now)}T00:00:00+07:00`);
  return classes
    .flatMap((demoClass) => demoClass.sessions.map((session) => ({ demoClass, session })))
    .filter(({ session }) => session.status === 'SCHEDULED' && session.startsAt >= startOfToday)
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime())
    .slice(0, limit);
}
