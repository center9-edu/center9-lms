import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TeacherProfile, User, UserRole } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import { nextProfileCode, retryOnUniqueConflict } from '../profile-code.js';
import type { TeacherDetailDto, TeacherSummaryDto, UpsertTeacherProfileInput } from './teachers.dto.js';

// ponytail: one page is enough for one center; add paging when teachers outgrow it.
const MAX_LISTED_TEACHERS = 1_000;

type TeacherUser = User & { roles: UserRole[]; teacherProfile: TeacherProfile | null };

const isTeacher = (user: { roles: UserRole[] }) => user.roles.some(({ role }) => role === 'TEACHER');

function toDetail(user: TeacherUser): TeacherDetailDto {
  const profile = user.teacherProfile;
  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    status: user.status,
    profile: profile && { teacherCode: profile.teacherCode, bio: profile.bio },
  };
}

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<TeacherSummaryDto[]> {
    const users = await this.prisma.user.findMany({
      where: { roles: { some: { role: 'TEACHER' } } },
      include: { roles: true, teacherProfile: true },
      orderBy: { fullName: 'asc' },
      take: MAX_LISTED_TEACHERS,
    });
    return users.map((user) => ({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      status: user.status,
      teacherCode: user.teacherProfile?.teacherCode ?? null,
    }));
  }

  async get(userId: string): Promise<TeacherDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { roles: true, teacherProfile: true } });
    if (!user || !isTeacher(user)) {
      throw new NotFoundException();
    }
    return toDetail(user);
  }

  /** Creates the profile (with a new code) on first save, replaces its fields afterwards. */
  async upsert(actor: AuthContext, userId: string, input: UpsertTeacherProfileInput): Promise<TeacherDetailDto> {
    return retryOnUniqueConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, include: { roles: true, teacherProfile: true } });
        if (!user) {
          throw new NotFoundException();
        }
        if (!isTeacher(user)) {
          throw new BadRequestException('User is not a teacher');
        }
        const created = !user.teacherProfile;
        const teacherProfile = created
          ? await tx.teacherProfile.create({ data: { userId, teacherCode: await nextProfileCode(tx, 'GV'), ...input } })
          : await tx.teacherProfile.update({ where: { userId }, data: input });
        await tx.auditLog.create({
          data: { actorId: actor.user.id, action: 'teacher.profile_upserted', entityType: 'teacher_profile', entityId: userId, metadata: { created } },
        });
        return toDetail({ ...user, teacherProfile });
      }),
    );
  }
}
