import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Guardian, User } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import type { StudentDetailDto } from '../students/students.dto.js';
import { StudentsService } from '../students/students.service.js';
import type { GuardianDto, GuardianInput, LinkInput } from './guardians.dto.js';

// ponytail: one page is enough for one center; add search when guardians outgrow it.
const MAX_LISTED_GUARDIANS = 1_000;

/** Only what the DTO shows of the linked account; never the whole user row. */
const GUARDIAN_INCLUDE = { user: { select: { username: true, fullName: true } } } satisfies Prisma.GuardianInclude;

function toDto(guardian: Guardian & { user: Pick<User, 'username' | 'fullName'> | null }): GuardianDto {
  return {
    id: guardian.id,
    fullName: guardian.fullName,
    phone: guardian.phone,
    email: guardian.email,
    username: guardian.user?.username ?? null,
    accountFullName: guardian.user?.fullName ?? null,
  };
}

const isUniqueConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
  ) {}

  async list(): Promise<GuardianDto[]> {
    const guardians = await this.prisma.guardian.findMany({ include: GUARDIAN_INCLUDE, orderBy: { fullName: 'asc' }, take: MAX_LISTED_GUARDIANS });
    return guardians.map(toDto);
  }

  async create(actor: AuthContext, input: GuardianInput): Promise<GuardianDto> {
    return this.save(actor, null, input);
  }

  async update(actor: AuthContext, guardianId: string, input: GuardianInput): Promise<GuardianDto> {
    return this.save(actor, guardianId, input);
  }

  /** Adds the guardian to the student, or changes an existing link. At most one primary contact per student. */
  async link(actor: AuthContext, studentId: string, guardianId: string, input: LinkInput): Promise<StudentDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      // Locks the student's profile row, so concurrent link changes for one student run one after another
      // and cannot leave two primary contacts. ponytail: a partial unique index would also do, but needs a migration.
      const profile = await tx.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;
      if (profile.length === 0) {
        throw new NotFoundException('Student profile not found');
      }
      if (!(await tx.guardian.findUnique({ where: { id: guardianId } }))) {
        throw new NotFoundException('Guardian not found');
      }
      if (input.isPrimaryContact) {
        await tx.studentGuardian.updateMany({ where: { studentId, guardianId: { not: guardianId } }, data: { isPrimaryContact: false } });
      }
      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId, guardianId } },
        create: { studentId, guardianId, ...input },
        update: input,
      });
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'guardian.linked', entityType: 'student_profile', entityId: studentId, metadata: { guardianId, ...input } },
      });
    });
    return this.students.get(studentId);
  }

  async unlink(actor: AuthContext, studentId: string, guardianId: string): Promise<StudentDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studentGuardian.deleteMany({ where: { studentId, guardianId } });
      if (count === 0) {
        throw new NotFoundException();
      }
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'guardian.unlinked', entityType: 'student_profile', entityId: studentId, metadata: { guardianId } },
      });
    });
    return this.students.get(studentId);
  }

  private async save(actor: AuthContext, guardianId: string | null, input: GuardianInput): Promise<GuardianDto> {
    const { username, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (guardianId !== null && !(await tx.guardian.findUnique({ where: { id: guardianId } }))) {
          throw new NotFoundException();
        }
        const data = { ...fields, userId: username === null ? null : await this.parentAccountId(tx, username) };
        const guardian =
          guardianId === null
            ? await tx.guardian.create({ data, include: GUARDIAN_INCLUDE })
            : await tx.guardian.update({ where: { id: guardianId }, data, include: GUARDIAN_INCLUDE });
        // Only whether an account is linked: names and contact details stay out of the audit log.
        await tx.auditLog.create({
          data: {
            actorId: actor.user.id,
            action: guardianId === null ? 'guardian.created' : 'guardian.updated',
            entityType: 'guardian',
            entityId: guardian.id,
            metadata: { hasAccount: data.userId !== null },
          },
        });
        return toDto(guardian);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('This account is already linked to another guardian');
      }
      throw error;
    }
  }

  private async parentAccountId(tx: Prisma.TransactionClient, username: string): Promise<string> {
    const user = await tx.user.findUnique({ where: { username }, include: { roles: true } });
    if (!user?.roles.some(({ role }) => role === 'PARENT')) {
      throw new BadRequestException('username must belong to an account with the PARENT role');
    }
    return user.id;
  }
}
