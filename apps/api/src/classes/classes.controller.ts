import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { classStatusSchema, createClassSchema, enrollmentStatusSchema, enrollSchema, teacherRoleSchema, updateClassSchema } from './classes.dto.js';
import type { ClassDetailDto, ClassDto, EnrollmentDto } from './classes.dto.js';
import { ClassesService } from './classes.service.js';
import { EnrollmentsService } from './enrollments.service.js';

// Agreed 2026-11-26: admins create and run classes; admins and sales enroll students; sales and teachers read
// (teachers only their own classes).
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'SALES', 'TEACHER')
@Controller('classes')
export class ClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  @Get()
  list(@CurrentSession() session: AuthContext): Promise<ClassDto[]> {
    return this.classes.list(session);
  }

  /** By code, the key in page URLs; changes go by id. */
  @Get(':code')
  get(@CurrentSession() session: AuthContext, @Param('code') code: string): Promise<ClassDetailDto> {
    return this.classes.getByCode(session, code);
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN')
  @Post()
  create(@CurrentSession() session: AuthContext, @Body() body: unknown): Promise<ClassDto> {
    return this.classes.create(session, parseBody(createClassSchema, body));
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN')
  @Put(':id')
  update(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ClassDto> {
    return this.classes.update(session, id, parseBody(updateClassSchema, body));
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN')
  @Post(':id/status')
  @HttpCode(200)
  setStatus(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ClassDto> {
    return this.classes.setStatus(session, id, parseBody(classStatusSchema, body).status);
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN')
  @Put(':id/teachers/:teacherId')
  assignTeacher(
    @CurrentSession() session: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @Body() body: unknown,
  ): Promise<ClassDto> {
    return this.classes.assignTeacher(session, id, teacherId, parseBody(teacherRoleSchema, body).role);
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN')
  @Delete(':id/teachers/:teacherId')
  @HttpCode(200)
  removeTeacher(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('teacherId', ParseUUIDPipe) teacherId: string): Promise<ClassDto> {
    return this.classes.removeTeacher(session, id, teacherId);
  }

  @Get(':id/enrollments')
  listEnrollments(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<EnrollmentDto[]> {
    return this.enrollments.list(session, id);
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'SALES')
  @Post(':id/enrollments')
  enroll(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<EnrollmentDto> {
    return this.enrollments.enroll(session, id, parseBody(enrollSchema, body).studentId);
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'SALES')
  @Put(':id/enrollments/:enrollmentId/status')
  setEnrollmentStatus(
    @CurrentSession() session: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() body: unknown,
  ): Promise<EnrollmentDto> {
    return this.enrollments.setStatus(session, id, enrollmentId, parseBody(enrollmentStatusSchema, body).status);
  }
}
