import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CurriculumController } from './curriculum.controller.js';
import { CurriculumService } from './curriculum.service.js';

@Module({
  // A curriculum edit settles the course's ended sessions first (ClassSessionsService).
  imports: [ClassesModule],
  controllers: [CoursesController, CurriculumController],
  providers: [CoursesService, CurriculumService],
  // lesson-files locks a lesson's course through it.
  exports: [CurriculumService],
})
export class CoursesModule {}
