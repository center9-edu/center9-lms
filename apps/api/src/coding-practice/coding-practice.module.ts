import { Module } from '@nestjs/common';
import { CodingPracticeController } from './coding-practice.controller.js';
import { CodingPracticeService } from './coding-practice.service.js';
import { Judge0Client } from './judge0.client.js';

@Module({
  controllers: [CodingPracticeController],
  providers: [CodingPracticeService, Judge0Client],
})
export class CodingPracticeModule {}
