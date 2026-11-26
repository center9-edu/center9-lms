import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { parseBody } from '../parse-body.js';
import { chapterSchema, lessonSchema, orderSchema } from './courses.dto.js';
import type { CourseDetailDto } from './courses.dto.js';
import { CurriculumService } from './curriculum.service.js';

/** Writes to a course's chapters and lessons; reading the tree is GET /courses/:slug. Each returns the updated tree. */
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
@Controller()
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Post('courses/:id/chapters')
  addChapter(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) courseId: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.curriculum.addChapter(session, courseId, parseBody(chapterSchema, body));
  }

  @Put('courses/:id/chapters/order')
  orderChapters(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) courseId: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.curriculum.orderChapters(session, courseId, parseBody(orderSchema, body).ids);
  }

  @Put('chapters/:id')
  updateChapter(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.curriculum.updateChapter(session, id, parseBody(chapterSchema, body));
  }

  @Delete('chapters/:id')
  @HttpCode(200)
  deleteChapter(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<CourseDetailDto> {
    return this.curriculum.deleteChapter(session, id);
  }

  @Post('chapters/:id/lessons')
  addLesson(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) chapterId: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.curriculum.addLesson(session, chapterId, parseBody(lessonSchema, body));
  }

  @Put('chapters/:id/lessons/order')
  orderLessons(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) chapterId: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.curriculum.orderLessons(session, chapterId, parseBody(orderSchema, body).ids);
  }

  @Put('lessons/:id')
  updateLesson(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CourseDetailDto> {
    return this.curriculum.updateLesson(session, id, parseBody(lessonSchema, body));
  }

  @Delete('lessons/:id')
  @HttpCode(200)
  deleteLesson(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<CourseDetailDto> {
    return this.curriculum.deleteLesson(session, id);
  }
}
