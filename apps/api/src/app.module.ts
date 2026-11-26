import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { CodingPracticeModule } from './coding-practice/coding-practice.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { GuardiansModule } from './guardians/guardians.module.js';
import { HealthController } from './health/health.controller.js';
import { LessonFilesModule } from './lesson-files/lesson-files.module.js';
import { PrismaModule } from './prisma.module.js';
import { StudentsModule } from './students/students.module.js';
import { TeachersModule } from './teachers/teachers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, AuthModule, CodingPracticeModule, UsersModule, StudentsModule, TeachersModule, GuardiansModule, CoursesModule, LessonFilesModule, ClassesModule],
  controllers: [HealthController],
})
export class AppModule {}
