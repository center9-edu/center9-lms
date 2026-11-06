import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@center9/database';
import type { Role, User } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma.service.js';
import type { CreateUserInput, CreateUserResultDto, UserSummaryDto } from './users.dto.js';

/** Only a SUPER_ADMIN may grant these. */
const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN'];
// ponytail: one page is enough for one center; add paging and search when accounts outgrow it.
const MAX_LISTED_USERS = 1_000;

function toSummary(user: User & { roles: { role: Role }[] }): UserSummaryDto {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles: user.roles.map(({ role }) => role),
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(): Promise<UserSummaryDto[]> {
    const users = await this.prisma.user.findMany({
      include: { roles: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED_USERS,
    });
    return users.map(toSummary);
  }

  async create(actor: AuthContext, input: CreateUserInput): Promise<CreateUserResultDto> {
    if (input.roles.some((role) => ADMIN_ROLES.includes(role)) && !actor.user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only a SUPER_ADMIN can grant admin roles');
    }

    const { password, passwordHash } = await this.auth.createTemporaryPassword();
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: input.username,
            fullName: input.fullName,
            passwordHash,
            mustChangePassword: true,
            roles: { create: input.roles.map((role) => ({ role })) },
          },
          include: { roles: true },
        });
        await tx.auditLog.create({
          data: { actorId: actor.user.id, action: 'user.created', entityType: 'user', entityId: created.id, metadata: { roles: input.roles } },
        });
        return created;
      });
      return { user: toSummary(user), temporaryPassword: password };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username is already taken');
      }
      throw error;
    }
  }
}
