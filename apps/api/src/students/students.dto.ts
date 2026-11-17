import { z } from 'zod';
import type { UserStatus } from '@center9/database';
import { optionalText } from '../parse-body.js';

const MAX_SCHOOL_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;

const DATE_OF_BIRTH_ERROR = 'dateOfBirth must be a date in YYYY-MM-DD format or null';

/** PUT replaces the whole profile: a field left out is cleared. */
export const upsertStudentProfileSchema = z.object({
  dateOfBirth: z.iso
    .date(DATE_OF_BIRTH_ERROR)
    .nullish()
    .transform((value) => value ?? null),
  schoolName: optionalText('schoolName', MAX_SCHOOL_NAME_LENGTH),
  notes: optionalText('notes', MAX_NOTES_LENGTH),
});

export type UpsertStudentProfileInput = z.output<typeof upsertStudentProfileSchema>;

export interface StudentSummaryDto {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  /** null until a profile is created. */
  studentCode: string | null;
  schoolName: string | null;
}

export interface StudentProfileDto {
  studentCode: string;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  schoolName: string | null;
  /** Internal staff notes; never send to students or parents. */
  notes: string | null;
}

export interface StudentGuardianDto {
  guardianId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  /** The guardian's PARENT account, if any. */
  username: string | null;
  relationship: string;
  isPrimaryContact: boolean;
}

export interface StudentDetailDto {
  userId: string;
  username: string;
  fullName: string;
  status: UserStatus;
  profile: StudentProfileDto | null;
  /** Primary contact first; empty until the student has a profile. */
  guardians: StudentGuardianDto[];
}
