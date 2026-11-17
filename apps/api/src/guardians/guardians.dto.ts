import { z } from 'zod';
import { optionalText } from '../parse-body.js';

const MAX_FULL_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_USERNAME_LENGTH = 32;
// Digits with the usual separators, optionally starting with +: "0900 000 001", "+84 90-000-0001".
const PHONE_PATTERN = /^\+?[0-9 .()-]{8,20}$/;

/** Agreed 2026-11-17: pick from a list (Bố, Mẹ, Ông, Bà, Khác) rather than free text. */
export const RELATIONSHIPS = ['FATHER', 'MOTHER', 'GRANDFATHER', 'GRANDMOTHER', 'OTHER'] as const;

const FULL_NAME_ERROR = `fullName must be a non-empty string of at most ${MAX_FULL_NAME_LENGTH} characters`;
const PHONE_ERROR = 'phone must be 8-20 digits, spaces or + . ( ) - characters, or null';
const EMAIL_ERROR = 'email must be a valid email address or null';
const CONTACT_ERROR = 'phone or email is required';
const RELATIONSHIP_ERROR = `relationship must be one of: ${RELATIONSHIPS.join(', ')}`;
const PRIMARY_ERROR = 'isPrimaryContact must be a boolean';

/** PUT replaces the whole guardian: a field left out is cleared. `username` links a PARENT account. */
export const guardianSchema = z
  .object({
    fullName: z.string(FULL_NAME_ERROR).trim().min(1, FULL_NAME_ERROR).max(MAX_FULL_NAME_LENGTH, FULL_NAME_ERROR),
    phone: optionalText('phone', 20).refine((value) => value === null || PHONE_PATTERN.test(value), PHONE_ERROR),
    email: optionalText('email', MAX_EMAIL_LENGTH).refine((value) => value === null || z.email().safeParse(value).success, EMAIL_ERROR),
    username: optionalText('username', MAX_USERNAME_LENGTH).transform((value) => value?.toLowerCase() ?? null),
  })
  .refine((guardian) => guardian.phone !== null || guardian.email !== null, CONTACT_ERROR);

export type GuardianInput = z.output<typeof guardianSchema>;

export const linkSchema = z.object({
  relationship: z.enum(RELATIONSHIPS, RELATIONSHIP_ERROR),
  isPrimaryContact: z.boolean(PRIMARY_ERROR).default(false),
});

export type LinkInput = z.output<typeof linkSchema>;

export interface GuardianDto {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  /** The linked PARENT account, if any. */
  username: string | null;
}
