import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CodingPracticeModule } from './coding-practice/coding-practice.module.js';
import { GuardiansModule } from './guardians/guardians.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma.module.js';
import { StudentsModule } from './students/students.module.js';
import { TeachersModule } from './teachers/teachers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, AuthModule, CodingPracticeModule, UsersModule, StudentsModule, TeachersModule, GuardiansModule],
  controllers: [HealthController],
})
export class AppModule {}
