import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@center9/database';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { CreateUserInput, CreateUserResultDto, UserSummaryDto } from './users.dto.js';
import { UsersService } from './users.service.js';

// Agreed rule: lowercase letters, digits and . _ -, 3-32 characters (easy to type for children and parents).
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const MAX_FULL_NAME_LENGTH = 100;
const ROLES: readonly string[] = Object.values(Role);

function parseCreateUserRequest(body: unknown): CreateUserInput {
  const { username, fullName, roles } = (body ?? {}) as Record<string, unknown>;
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new BadRequestException('username must be 3-32 characters of a-z, 0-9, ".", "_" or "-"');
  }
  const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
  if (trimmedName === '' || trimmedName.length > MAX_FULL_NAME_LENGTH) {
    throw new BadRequestException(`fullName must be a non-empty string of at most ${MAX_FULL_NAME_LENGTH} characters`);
  }
  if (
    !Array.isArray(roles) ||
    roles.length === 0 ||
    new Set(roles).size !== roles.length ||
    !roles.every((role): role is Role => typeof role === 'string' && ROLES.includes(role))
  ) {
    throw new BadRequestException(`roles must be a non-empty list of distinct values from: ${ROLES.join(', ')}`);
  }
  return { username: normalizedUsername, fullName: trimmedName, roles };
}

@Roles('SUPER_ADMIN', 'CENTER_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserSummaryDto[]> {
    return this.users.list();
  }

  @Post()
  create(@CurrentSession() session: AuthContext, @Body() body: unknown): Promise<CreateUserResultDto> {
    return this.users.create(session, parseCreateUserRequest(body));
  }
}
