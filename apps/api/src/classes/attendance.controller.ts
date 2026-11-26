import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { AttendanceService } from './attendance.service.js';
import { attendanceSchema } from './classes.dto.js';
import type { AttendanceSheetDto } from './classes.dto.js';

/** Agreed 2026-11-26: staff read attendance (teachers only for their classes); the class's own teachers mark it. */
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'SALES', 'TEACHER')
@Controller('class-sessions/:id/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  get(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<AttendanceSheetDto> {
    return this.attendance.get(session, id);
  }

  /** The service checks the teacher teaches this class. */
  @Roles('TEACHER')
  @Put()
  save(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AttendanceSheetDto> {
    return this.attendance.save(session, id, parseBody(attendanceSchema, body));
  }
}
