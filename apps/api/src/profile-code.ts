import { ConflictException } from '@nestjs/common';
import { Prisma } from '@center9/database';

const CODE_DIGITS = 4;
const MAX_ATTEMPTS = 3;

// One query per table: identifiers cannot be parameters, and tagged templates keep the SQL static.
const MAX_CODE_QUERIES = {
  HS: (tx: Prisma.TransactionClient) => tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(student_code FROM 3) AS INTEGER)) AS max
    FROM student_profiles
    WHERE student_code ~ '^HS[0-9]+$'`,
  GV: (tx: Prisma.TransactionClient) => tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(teacher_code FROM 3) AS INTEGER)) AS max
    FROM teacher_profiles
    WHERE teacher_code ~ '^GV[0-9]+$'`,
  LH: (tx: Prisma.TransactionClient) => tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)) AS max
    FROM classes
    WHERE code ~ '^LH[0-9]+$'`,
};

/**
 * Next profile or class code (HS0001, GV0001, LH0001, …): the highest number so far plus one, compared as numbers so
 * HS10000 follows HS9999. Run it inside retryOnUniqueConflict: two first saves can pick the same code.
 * ponytail: MAX + retry instead of a Postgres sequence (no migration); switch if profiles get bulk-created.
 */
export async function nextProfileCode(tx: Prisma.TransactionClient, prefix: keyof typeof MAX_CODE_QUERIES): Promise<string> {
  const [row] = await MAX_CODE_QUERIES[prefix](tx);
  return prefix + String((row?.max ?? 0) + 1).padStart(CODE_DIGITS, '0');
}

/** Reruns `save` when it hit a unique constraint (P2002); the rerun reads what the other request wrote. */
export async function retryOnUniqueConflict<T>(save: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await save();
    } catch (error) {
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!conflict) {
        throw error;
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new ConflictException('Another change was saved at the same time; please retry');
      }
    }
  }
}
