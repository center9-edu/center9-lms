import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { LessonFilesController } from './lesson-files.controller.js';
import { LessonFilesService } from './lesson-files.service.js';

@Module({
  imports: [CoursesModule, ClassesModule],
  controllers: [LessonFilesController],
  providers: [LessonFilesService],
})
export class LessonFilesModule {}
