// Local development only: fills an empty database with fake test accounts, all sharing one known password.
// Run with `pnpm db:seed` right after a reset; it refuses to touch a database that already has accounts.
import type { Role } from '@center9/database';
import { hashPassword } from '../auth/password.js';
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
  console.log(`\nPassword for every seeded account: ${SEED_PASSWORD}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
