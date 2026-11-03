import { Module } from '@nestjs/common';
import { CodingPracticeModule } from './coding-practice/coding-practice.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [CodingPracticeModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
