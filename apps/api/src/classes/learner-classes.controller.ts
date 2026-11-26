import { Controller, Get, Param } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import type { LearnerClassDetailDto, LearnerClassDto } from './classes.dto.js';
import { LearnerClassesService } from './learner-classes.service.js';

/**
 * Classes as students and parents see them (agreed 2026-11-26). Separate from /classes on purpose: the staff
 * DTO carries capacity and classmates, so it is never shaped per role and sent to a learner.
 */
@Roles('STUDENT', 'PARENT')
@Controller('learner/classes')
export class LearnerClassesController {
  constructor(private readonly classes: LearnerClassesService) {}

  @Get()
  list(@CurrentSession() session: AuthContext): Promise<LearnerClassDto[]> {
    return this.classes.list(session);
  }

  @Get(':code')
  get(@CurrentSession() session: AuthContext, @Param('code') code: string): Promise<LearnerClassDetailDto> {
    return this.classes.getByCode(session, code);
  }
}
