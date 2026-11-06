// Creates the first SUPER_ADMIN, who then creates every other account through the LMS.
// Run after `pnpm build`: pnpm --filter @center9/api create-super-admin <username> "<full name>"
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { PrismaService } from '../prisma.service.js';

const [rawUsername, rawFullName] = process.argv.slice(2);
const username = rawUsername?.trim().toLowerCase() ?? '';
const fullName = rawFullName?.trim() ?? '';

if (!username || /\s/.test(username) || !fullName) {
  console.error('Usage: pnpm --filter @center9/api create-super-admin <username> "<full name>"');
  process.exit(1);
}

const prisma = new PrismaService();
try {
  const password = generateTemporaryPassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    if ((await tx.userRole.count({ where: { role: 'SUPER_ADMIN' } })) > 0) {
      throw new Error('A SUPER_ADMIN already exists. Create other accounts from the LMS.');
    }
    const user = await tx.user.create({
      data: { username, fullName, passwordHash, mustChangePassword: true, roles: { create: { role: 'SUPER_ADMIN' } } },
    });
    await tx.auditLog.create({
      data: { action: 'user.created', entityType: 'user', entityId: user.id, metadata: { roles: ['SUPER_ADMIN'], via: 'cli' } },
    });
  });

  // ponytail: printed once to the operator's terminal by design; it is never logged or stored in plain text.
  console.log(`Created SUPER_ADMIN "${username}". Temporary password (must be changed at first login): ${password}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
