import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import type { StudentDetailDto } from '../students/students.dto.js';
import { guardianSchema, linkSchema } from './guardians.dto.js';
import type { GuardianDto } from './guardians.dto.js';
import { GuardiansService } from './guardians.service.js';

// Agreed 2026-11-17: sales may manage guardians too. Links live here, not in the students module,
// so that module stays unaware of guardians beyond reading them.
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'SALES')
@Controller()
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get('guardians')
  list(): Promise<GuardianDto[]> {
    return this.guardians.list();
  }

  @Post('guardians')
  create(@CurrentSession() session: AuthContext, @Body() body: unknown): Promise<GuardianDto> {
    return this.guardians.create(session, parseBody(guardianSchema, body));
  }

  @Put('guardians/:id')
  update(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<GuardianDto> {
    return this.guardians.update(session, id, parseBody(guardianSchema, body));
  }

  @Put('students/:userId/guardians/:guardianId')
  link(
    @CurrentSession() session: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body() body: unknown,
  ): Promise<StudentDetailDto> {
    return this.guardians.link(session, userId, guardianId, parseBody(linkSchema, body));
  }

  @Delete('students/:userId/guardians/:guardianId')
  unlink(
    @CurrentSession() session: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
  ): Promise<StudentDetailDto> {
    return this.guardians.unlink(session, userId, guardianId);
  }
}
