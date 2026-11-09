import { z } from 'zod';
import { Role, UserStatus } from '@center9/database';

// Agreed rule: lowercase letters, digits and . _ -, 3-32 characters (easy to type for children and parents).
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const MAX_FULL_NAME_LENGTH = 100;

const USERNAME_ERROR = 'username must be 3-32 characters of a-z, 0-9, ".", "_" or "-"';
const FULL_NAME_ERROR = `fullName must be a non-empty string of at most ${MAX_FULL_NAME_LENGTH} characters`;
const ROLES_ERROR = `roles must be a non-empty list of distinct values from: ${Object.values(Role).join(', ')}`;
const STATUS_ERROR = `status must be one of: ${Object.values(UserStatus).join(', ')}`;

const rolesSchema = z
  .array(z.enum(Role, ROLES_ERROR), ROLES_ERROR)
  .min(1, ROLES_ERROR)
  .refine((roles) => new Set(roles).size === roles.length, ROLES_ERROR);

export const createUserSchema = z.object({
  username: z.string(USERNAME_ERROR).trim().toLowerCase().regex(USERNAME_PATTERN, USERNAME_ERROR),
  fullName: z.string(FULL_NAME_ERROR).trim().min(1, FULL_NAME_ERROR).max(MAX_FULL_NAME_LENGTH, FULL_NAME_ERROR),
  roles: rolesSchema,
});

export const setRolesSchema = z.object({ roles: rolesSchema });

export const setStatusSchema = z.object({ status: z.enum(UserStatus, STATUS_ERROR) });

export type CreateUserInput = z.output<typeof createUserSchema>;

export interface UserSummaryDto {
  id: string;
  username: string;
  fullName: string;
  roles: Role[];
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface CreateUserResultDto {
  user: UserSummaryDto;
  /** Shown to the admin once; only its hash is stored. */
  temporaryPassword: string;
}

export interface ResetPasswordResultDto {
  /** Shown to the admin once; only its hash is stored. */
  temporaryPassword: string;
}
