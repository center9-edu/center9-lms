import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module.js';
import { GuardiansController } from './guardians.controller.js';
import { GuardiansService } from './guardians.service.js';

@Module({
  imports: [StudentsModule],
  controllers: [GuardiansController],
  providers: [GuardiansService],
})
export class GuardiansModule {}
