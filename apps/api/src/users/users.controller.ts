import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { createUserSchema, setRolesSchema, setStatusSchema } from './users.dto.js';
import type { CreateUserResultDto, ResetPasswordResultDto, UserSummaryDto } from './users.dto.js';
import { UsersService } from './users.service.js';

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
    return this.users.create(session, parseBody(createUserSchema, body));
  }

  @Post(':id/password-reset')
  @HttpCode(200)
  resetPassword(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<ResetPasswordResultDto> {
    return this.users.resetPassword(session, id);
  }

  @Put(':id/roles')
  setRoles(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<UserSummaryDto> {
    return this.users.setRoles(session, id, parseBody(setRolesSchema, body).roles);
  }

  @Patch(':id/status')
  setStatus(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<UserSummaryDto> {
    return this.users.setStatus(session, id, parseBody(setStatusSchema, body).status);
  }
}
