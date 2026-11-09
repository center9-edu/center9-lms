import { z } from 'zod';
import type { Role } from '@center9/database';

// The upper bounds also cap the work scrypt does for one request.
const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 128;
const MIN_NEW_PASSWORD_LENGTH = 8;

const USERNAME_ERROR = `username must be a non-empty string of at most ${MAX_USERNAME_LENGTH} characters`;
const NEW_PASSWORD_ERROR = `newPassword must be ${MIN_NEW_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long`;

function nonEmptyPassword(field: string) {
  const message = `${field} must be a non-empty string of at most ${MAX_PASSWORD_LENGTH} characters`;
  return z.string(message).min(1, message).max(MAX_PASSWORD_LENGTH, message);
}

export const loginSchema = z.object({
  // Not trimmed here: AuthService.login normalizes the username itself.
  username: z
    .string(USERNAME_ERROR)
    .max(MAX_USERNAME_LENGTH, USERNAME_ERROR)
    .refine((value) => value.trim() !== '', USERNAME_ERROR),
  password: nonEmptyPassword('password'),
});

export const changePasswordSchema = z.object({
  currentPassword: nonEmptyPassword('currentPassword'),
  newPassword: z.string(NEW_PASSWORD_ERROR).min(MIN_NEW_PASSWORD_LENGTH, NEW_PASSWORD_ERROR).max(MAX_PASSWORD_LENGTH, NEW_PASSWORD_ERROR),
});

export interface SessionUserDto {
  id: string;
  username: string;
  fullName: string;
  roles: Role[];
  mustChangePassword: boolean;
}

export interface LoginResultDto {
  token: string;
  user: SessionUserDto;
}

export interface AuthContext {
  sessionId: string;
  user: SessionUserDto;
}

// ponytail: only the fields the guard touches; @types/express is not installed.
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
}
