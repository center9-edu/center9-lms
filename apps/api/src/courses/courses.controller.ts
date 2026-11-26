import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { createCourseSchema, updateCourseSchema } from './courses.dto.js';
import type { CourseDetailDto, CourseSummaryDto } from './courses.dto.js';
import { CoursesService } from './courses.service.js';

// Agreed 2026-11-17, kept 2026-11-26: admins and every teacher author; sales read. Method-level @Roles override this one.
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(): Promise<CourseSummaryDto[]> {
    return this.courses.list();
  }

  /** By slug, the key in page URLs; changes go by id. */
  @Get(':slug')
  get(@Param('slug') slug: string): Promise<CourseDetailDto> {
    return this.courses.getBySlug(slug);
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
  @Post()
  create(@CurrentSession() session: AuthContext, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.courses.create(session, parseBody(createCourseSchema, body));
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
  @Put(':id')
  update(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.courses.update(session, id, parseBody(updateCourseSchema, body));
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<CourseDetailDto> {
    return this.courses.archive(session, id);
  }
}
