import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { upsertStudentProfileSchema } from './students.dto.js';
import type { StudentDetailDto, StudentSummaryDto } from './students.dto.js';
import { StudentsService } from './students.service.js';

// Agreed 2026-11-17: sales may manage student profiles too.
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'SALES')
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(): Promise<StudentSummaryDto[]> {
    return this.students.list();
  }

  @Get(':userId')
  get(@Param('userId', ParseUUIDPipe) userId: string): Promise<StudentDetailDto> {
    return this.students.get(userId);
  }

  @Put(':userId')
  upsert(@CurrentSession() session: AuthContext, @Param('userId', ParseUUIDPipe) userId: string, @Body() body: unknown): Promise<StudentDetailDto> {
    return this.students.upsert(session, userId, parseBody(upsertStudentProfileSchema, body));
  }
}
