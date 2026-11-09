// Local development only: fills an empty database with fake test accounts, all sharing one known password.
// Run with `pnpm db:seed`. Accounts that already exist are left untouched, so it is safe to rerun.
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
  for (const { username, fullName, roles } of SEED_USERS) {
    if (await prisma.user.findUnique({ where: { username } })) {
      console.log(`skipped  ${username.padEnd(10)} already exists`);
      continue;
    }
    await prisma.user.create({
      data: {
        username,
        fullName,
        passwordHash: await hashPassword(SEED_PASSWORD),
        mustChangePassword: false,
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    console.log(`created  ${username.padEnd(10)} ${roles.join(', ')}`);
  }
  console.log(`\nPassword for every seeded account: ${SEED_PASSWORD}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
