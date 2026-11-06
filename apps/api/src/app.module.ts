import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CodingPracticeModule } from './coding-practice/coding-practice.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, AuthModule, CodingPracticeModule, UsersModule],
  controllers: [HealthController],
})
export class AppModule {}
