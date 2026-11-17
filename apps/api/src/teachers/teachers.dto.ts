import { z } from 'zod';
import type { UserStatus } from '@center9/database';
import { optionalText } from '../parse-body.js';

const MAX_BIO_LENGTH = 2_000;

/** PUT replaces the whole profile: a field left out is cleared. */
export const upsertTeacherProfileSchema = z.object({
  bio: optionalText('bio', MAX_BIO_LENGTH),
});

export type UpsertTeacherProfileInput = z.output<typeof upsertTeacherProfileSchema>;

export interface TeacherSummaryDto {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  /** null until a profile is created. */
  teacherCode: string | null;
}

export interface TeacherDetailDto {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  profile: { teacherCode: string; bio: string | null } | null;
}
