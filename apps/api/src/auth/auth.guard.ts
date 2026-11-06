import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@center9/database';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';
import type { AuthenticatedRequest } from './auth.dto.js';
import { AuthService } from './auth.service.js';

function bearerToken(header: string | string[] | undefined): string | undefined {
  const match = typeof header === 'string' ? /^Bearer ([\w-]+)$/.exec(header) : null;
  return match?.[1];
}

/** Registered globally: every endpoint requires a session unless it is marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    const session = token ? await this.auth.findSessionUser(token) : null;
    if (!session) {
      throw new UnauthorizedException();
    }

    if (session.user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, targets)) {
      throw new ForbiddenException('Password change required');
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.some((role) => session.user.roles.includes(role))) {
      throw new ForbiddenException();
    }

    request.auth = session;
    return true;
  }
}
