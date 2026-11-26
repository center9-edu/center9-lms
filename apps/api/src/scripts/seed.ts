// Local development only: fills an empty database with fake test accounts, all sharing one known password.
// Run with `pnpm db:seed` right after a reset; it refuses to touch a database that already has accounts.
import type { Role } from '@center9/database';
import { hashPassword } from '../auth/password.js';
import { weeklySessions } from '../classes/schedule.js';
import { PrismaService } from '../prisma.service.js';

const SEED_PASSWORD = 'Center9-test';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Fake people only: real users are children, never put their data here.
const SEED_USERS: { username: string; fullName: string; roles: Role[] }[] = [
  { username: 'admin', fullName: 'Quản trị viên', roles: ['SUPER_ADMIN'] },
  { username: 'ql.mai', fullName: 'Đỗ Thị Mai', roles: ['CENTER_ADMIN'] },
  { username: 'nv.ha', fullName: 'Lê Thu Hà', roles: ['SALES'] },
  { username: 'gv.lan', fullName: 'Trần Thị Lan', roles: ['TEACHER'] },
  { username: 'gv.nam', fullName: 'Phạm Văn Nam', roles: ['TEACHER', 'SALES'] },
  { username: 'hs.minh', fullName: 'Nguyễn Văn Minh', roles: ['STUDENT'] },
  { username: 'hs.an', fullName: 'Lê Bảo An', roles: ['STUDENT'] },
  { username: 'ph.hung', fullName: 'Nguyễn Văn Hùng', roles: ['PARENT'] },
];

// A known password on a SUPER_ADMIN must never reach a shared database.
const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseHost = URL.canParse(databaseUrl) ? new URL(databaseUrl).hostname : '';
if (!LOCAL_HOSTS.includes(databaseHost)) {
  console.error('Refusing to seed: DATABASE_URL does not point to a local database.');
  process.exit(1);
}

const prisma = new PrismaService();
try {
  // An SSH tunnel to a shared database also looks like localhost; one that already has accounts is never seeded.
  if ((await prisma.user.count()) > 0) {
    throw new Error('Refusing to seed: the database already has accounts. Reset it first.');
  }
  const ids = new Map<string, string>();
  for (const { username, fullName, roles } of SEED_USERS) {
    const { id } = await prisma.user.create({
      data: {
        username,
        fullName,
        passwordHash: await hashPassword(SEED_PASSWORD),
        mustChangePassword: false,
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    ids.set(username, id);
    console.log(`created  ${username.padEnd(10)} ${roles.join(', ')}`);
  }
  const idOf = (username: string) => ids.get(username) ?? '';

  // Codes continue from these: the API numbers new profiles after the highest existing one.
  await prisma.teacherProfile.createMany({
    data: [
      { userId: idOf('gv.lan'), teacherCode: 'GV0001', bio: 'Dạy Python và Scratch cho học sinh tiểu học.' },
      { userId: idOf('gv.nam'), teacherCode: 'GV0002', bio: null },
    ],
  });
  await prisma.studentProfile.createMany({
    data: [
      { userId: idOf('hs.minh'), studentCode: 'HS0001', dateOfBirth: new Date('2014-03-02'), schoolName: 'THCS Thử Nghiệm', notes: 'Ghi chú nội bộ mẫu.' },
      { userId: idOf('hs.an'), studentCode: 'HS0002', dateOfBirth: null, schoolName: null, notes: null },
    ],
  });
  // One guardian with a PARENT account, one contact-only guardian.
  await prisma.guardian.create({
    data: {
      fullName: 'Nguyễn Văn Hùng',
      phone: '0900 000 001',
      userId: idOf('ph.hung'),
      students: { create: { studentId: idOf('hs.minh'), relationship: 'FATHER', isPrimaryContact: true } },
    },
  });
  await prisma.guardian.create({
    data: {
      fullName: 'Lê Thị Hoa',
      email: 'hoa.le@example.com',
      students: { create: { studentId: idOf('hs.an'), relationship: 'MOTHER', isPrimaryContact: true } },
    },
  });
  console.log('created  profiles: HS0001-HS0002, GV0001-GV0002, 2 guardians');

  // One course of 10 parts (one session each), and one class running on it. No lesson files: upload them in the app.
  const lessons = (titles: [string, number][]) => ({ create: titles.map(([title, partCount], position) => ({ title, partCount, position })) });
  const course = await prisma.course.create({
    data: {
      title: 'Lập trình Python Cơ bản',
      slug: 'lap-trinh-python-co-ban',
      description: 'Khoá học mẫu: làm quen Python qua 10 buổi, từ biến, điều kiện, vòng lặp đến hàm và một trò chơi nhỏ.',
      subject: 'PYTHON',
      level: 'BASIC',
      createdById: idOf('gv.lan'),
      chapters: {
        create: [
          { title: 'Làm quen với Python', position: 0, lessons: lessons([['Bài 1: Python là gì? Chương trình đầu tiên', 1], ['Bài 2: Biến và kiểu dữ liệu', 2]]) },
          { title: 'Điều kiện và vòng lặp', position: 1, lessons: lessons([['Bài 3: Câu lệnh if', 2], ['Bài 4: Vòng lặp for và while', 2]]) },
          { title: 'Hàm và dự án nhỏ', position: 2, lessons: lessons([['Bài 5: Hàm', 1], ['Bài 6: Dự án trò chơi đoán số', 2]]) },
        ],
      },
    },
  });
  console.log('created  course: lap-trinh-python-co-ban (3 chapters, 6 lessons, 10 parts)');

  // Monday, Wednesday and Friday evenings from the Monday of last week, so some lessons are already open to students
  // and some are still locked whenever the seed runs.
  const today = new Date(Date.now() + 7 * 3_600_000); // Vietnam is UTC+7
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const startDate = new Date(today.getTime() - (daysSinceMonday + 7) * 86_400_000).toISOString().slice(0, 10);
  const pattern = { weekdays: [1, 3, 5], startTime: '18:00', endTime: '19:30' };
  const sessions = weeklySessions({ startDate, ...pattern, count: 10 });
  const seededClass = await prisma.class.create({
    data: {
      code: 'LH0001',
      name: 'Python Cơ bản – Tối T2/T4/T6',
      courseId: course.id,
      status: 'IN_PROGRESS',
      startDate: new Date(startDate),
      endDate: sessions.at(-1)?.startsAt ?? null,
      capacity: 12,
      scheduleWeekdays: pattern.weekdays,
      scheduleStartTime: pattern.startTime,
      scheduleEndTime: pattern.endTime,
      teachers: {
        create: [
          { teacherId: idOf('gv.lan'), roleInClass: 'MAIN_TEACHER' },
          { teacherId: idOf('gv.nam'), roleInClass: 'ASSISTANT' },
        ],
      },
      enrollments: { create: [{ studentId: idOf('hs.minh') }, { studentId: idOf('hs.an') }] },
      // title is an optional label: the API works out each session's number and lesson on every read.
      sessions: { create: sessions.map((times) => ({ title: '', ...times })) },
    },
    include: { enrollments: true, sessions: { orderBy: { startsAt: 'asc' } } },
  });
  // Attendance for the sessions already over, and gv.nam teaching the second one as a substitute. The API marks
  // them taught on the first read of the schedule, the way it does for every class (it keeps the substitute).
  const now = new Date();
  const past = seededClass.sessions.filter(({ endsAt }) => endsAt <= now);
  const marks = ['PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'ABSENT', 'PRESENT', 'EXCUSED'] as const;
  const markFor = (n: number) => marks[n % marks.length] ?? 'PRESENT';
  for (const [index, session] of past.entries()) {
    const markedById = index === 1 ? idOf('gv.nam') : idOf('gv.lan');
    if (index === 1) {
      await prisma.classSession.update({ where: { id: session.id }, data: { taughtById: markedById } });
    }
    await prisma.attendance.createMany({
      data: seededClass.enrollments.map((enrollment, offset) => ({
        classId: seededClass.id,
        classSessionId: session.id,
        enrollmentId: enrollment.id,
        status: markFor(index + offset * 3),
        note: markFor(index + offset * 3) === 'ABSENT' ? 'Gia đình báo nghỉ (ghi chú mẫu)' : null,
        markedById,
      })),
    });
  }
  console.log(`created  class:  LH0001 (in progress, 10 sessions from ${startDate}, ${past.length} with attendance; hs.minh and hs.an; parent ph.hung sees it)`);
  console.log(`\nPassword for every seeded account: ${SEED_PASSWORD}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
