import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { upsertTeacherProfileSchema } from './teachers.dto.js';
import type { TeacherDetailDto, TeacherSummaryDto } from './teachers.dto.js';
import { TeachersService } from './teachers.service.js';

// Agreed 2026-11-17: only admins manage teacher profiles (sales manage students and parents).
@Roles('SUPER_ADMIN', 'CENTER_ADMIN')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list(): Promise<TeacherSummaryDto[]> {
    return this.teachers.list();
  }

  @Get(':userId')
  get(@Param('userId', ParseUUIDPipe) userId: string): Promise<TeacherDetailDto> {
    return this.teachers.get(userId);
  }

  @Put(':userId')
  upsert(@CurrentSession() session: AuthContext, @Param('userId', ParseUUIDPipe) userId: string, @Body() body: unknown): Promise<TeacherDetailDto> {
    return this.teachers.upsert(session, userId, parseBody(upsertTeacherProfileSchema, body));
  }
}
