import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { ClassSessionsService } from './class-sessions.service.js';
import { scheduleSchema, sessionTimesSchema } from './classes.dto.js';
import type { ClassDetailDto } from './classes.dto.js';

/** Writes to a class's sessions (agreed 2026-11-26: admins run classes; teachers give days off). Reading them is GET /classes/:code. */
@Roles('SUPER_ADMIN', 'CENTER_ADMIN')
@Controller()
export class ClassSessionsController {
  constructor(private readonly sessions: ClassSessionsService) {}

  @Post('classes/:id/schedule')
  createSchedule(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) classId: string, @Body() body: unknown): Promise<ClassDetailDto> {
    return this.sessions.createSchedule(session, classId, parseBody(scheduleSchema, body));
  }

  @Post('classes/:id/sessions')
  addSession(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) classId: string, @Body() body: unknown): Promise<ClassDetailDto> {
    return this.sessions.addSession(session, classId, parseBody(sessionTimesSchema, body));
  }

  @Put('class-sessions/:id')
  updateSession(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ClassDetailDto> {
    return this.sessions.updateSession(session, id, parseBody(sessionTimesSchema, body));
  }

  /** Teachers too, but only of their own class: the service checks that. */
  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
  @Post('class-sessions/:id/day-off')
  @HttpCode(200)
  dayOff(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<ClassDetailDto> {
    return this.sessions.dayOff(session, id);
  }
}
