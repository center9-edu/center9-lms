import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, UserRole } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import { nextProfileCode, retryOnUniqueConflict } from '../profile-code.js';
import type { StudentDetailDto, StudentSummaryDto, UpsertStudentProfileInput } from './students.dto.js';

// ponytail: one page is enough for one center; add paging and search when students outgrow it.
const MAX_LISTED_STUDENTS = 1_000;

const DETAIL_INCLUDE = {
  roles: true,
  studentProfile: {
    include: {
      guardians: {
        include: { guardian: { include: { user: { select: { username: true } } } } },
        orderBy: [{ isPrimaryContact: 'desc' }, { guardian: { fullName: 'asc' } }],
      },
    },
  },
} satisfies Prisma.UserInclude;

type StudentUser = Prisma.UserGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const isStudent = (user: { roles: UserRole[] }) => user.roles.some(({ role }) => role === 'STUDENT');

function toDetail(user: StudentUser): StudentDetailDto {
  const profile = user.studentProfile;
  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    status: user.status,
    profile: profile && {
      studentCode: profile.studentCode,
      // A @db.Date comes back as midnight UTC.
      dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      schoolName: profile.schoolName,
      notes: profile.notes,
    },
    guardians: (profile?.guardians ?? []).map(({ guardian, relationship, isPrimaryContact }) => ({
      guardianId: guardian.id,
      fullName: guardian.fullName,
      phone: guardian.phone,
      email: guardian.email,
      username: guardian.user?.username ?? null,
      relationship,
      isPrimaryContact,
    })),
  };
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<StudentSummaryDto[]> {
    const users = await this.prisma.user.findMany({
      where: { roles: { some: { role: 'STUDENT' } } },
      include: { roles: true, studentProfile: true },
      orderBy: { fullName: 'asc' },
      take: MAX_LISTED_STUDENTS,
    });
    return users.map((user) => ({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      status: user.status,
      studentCode: user.studentProfile?.studentCode ?? null,
      schoolName: user.studentProfile?.schoolName ?? null,
    }));
  }

  async get(userId: string): Promise<StudentDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: DETAIL_INCLUDE });
    if (!user || !isStudent(user)) {
      throw new NotFoundException();
    }
    return toDetail(user);
  }

  /** Creates the profile (with a new code) on first save, replaces its fields afterwards. */
  async upsert(actor: AuthContext, userId: string, input: UpsertStudentProfileInput): Promise<StudentDetailDto> {
    const data = { ...input, dateOfBirth: input.dateOfBirth === null ? null : new Date(input.dateOfBirth) };
    // Two first saves at once: one took the code (or the profile itself); the retry then updates.
    return retryOnUniqueConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, include: DETAIL_INCLUDE });
        if (!user) {
          throw new NotFoundException();
        }
        if (!isStudent(user)) {
          throw new BadRequestException('User is not a student');
        }
        const created = !user.studentProfile;
        const studentProfile = created
          ? await tx.studentProfile.create({ data: { userId, studentCode: await nextProfileCode(tx, 'HS'), ...data } })
          : await tx.studentProfile.update({ where: { userId }, data });
        await tx.auditLog.create({
          data: { actorId: actor.user.id, action: 'student.profile_upserted', entityType: 'student_profile', entityId: userId, metadata: { created } },
        });
        return toDetail({ ...user, studentProfile: { ...studentProfile, guardians: user.studentProfile?.guardians ?? [] } });
      }),
    );
  }
}
