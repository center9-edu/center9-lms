import type { Role, UserStatus } from '@center9/database';

export interface UserSummaryDto {
  id: string;
  username: string;
  fullName: string;
  roles: Role[];
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  roles: Role[];
}

export interface CreateUserResultDto {
  user: UserSummaryDto;
  /** Shown to the admin once; only its hash is stored. */
  temporaryPassword: string;
}
