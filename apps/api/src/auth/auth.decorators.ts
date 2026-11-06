import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@center9/database';
import type { AuthContext, AuthenticatedRequest } from './auth.dto.js';

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'auth:allow-pending-password-change';

/** Skips authentication. Every other endpoint requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires at least one of the roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Reachable while the user still has to change a temporary password. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);

/** The session that the AuthGuard attached; only use it on non-public endpoints. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) {
      throw new Error('CurrentSession used on an endpoint without a session');
    }
    return auth;
  },
);
