import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { ClassSessionsController } from './class-sessions.controller.js';
import { ClassSessionsService } from './class-sessions.service.js';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';
import { EnrollmentsService } from './enrollments.service.js';
import { LearnerClassesController } from './learner-classes.controller.js';
import { LearnerClassesService } from './learner-classes.service.js';

@Module({
  controllers: [ClassesController, ClassSessionsController, LearnerClassesController, AttendanceController],
  providers: [ClassesService, EnrollmentsService, ClassSessionsService, LearnerClassesService, AttendanceService],
  // lesson-files asks it whether a learner may open a lesson's file; the curriculum settles sessions before an edit.
  exports: [LearnerClassesService, ClassSessionsService],
})
export class ClassesModule {}
