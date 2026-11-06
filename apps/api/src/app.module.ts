import { Module } from '@nestjs/common';
import { CodingPracticeModule } from './coding-practice/coding-practice.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma.module.js';

@Module({
  imports: [PrismaModule, CodingPracticeModule],
  controllers: [HealthController],
})
export class AppModule {}
