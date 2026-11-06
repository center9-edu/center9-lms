import type { Role } from '@center9/database';

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
