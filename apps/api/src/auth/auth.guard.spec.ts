import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AllowPendingPasswordChange, Public, Roles } from './auth.decorators.js';
import type { AuthContext, AuthenticatedRequest } from './auth.dto.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

class Endpoints {
  @Public() open() {}
  protected() {}
  @AllowPendingPasswordChange() me() {}
  @Roles('SUPER_ADMIN', 'CENTER_ADMIN') admin() {}
}

@Public()
class PublicController {
  anything() {}
}

function contextFor(handler: () => void, request: AuthenticatedRequest, controller: object = Endpoints) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(session: AuthContext | null) {
  const findSessionUser = vi.fn(async () => session);
  const guard = new AuthGuard(new Reflector(), { findSessionUser } as unknown as AuthService);
  return { guard, findSessionUser };
}

const session = (overrides: Partial<AuthContext['user']> = {}): AuthContext => ({
  sessionId: 's1',
  user: { id: 'u1', username: 'gv.lan', fullName: 'Lan', roles: ['TEACHER'], mustChangePassword: false, ...overrides },
});

const bearer = (token = 'tok'): AuthenticatedRequest => ({ headers: { authorization: `Bearer ${token}` } });
const { prototype: endpoints } = Endpoints;

describe('AuthGuard', () => {
  it('lets public endpoints and public controllers through without a token', async () => {
    const { guard, findSessionUser } = guardWith(null);
    await expect(guard.canActivate(contextFor(endpoints.open, { headers: {} }))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(PublicController.prototype.anything, { headers: {} }, PublicController))).resolves.toBe(true);
    expect(findSessionUser).not.toHaveBeenCalled();
  });

  it('denies by default without a valid bearer token', async () => {
    const { guard, findSessionUser } = guardWith(null);
    for (const headers of [{}, { authorization: 'tok' }, { authorization: 'Basic tok' }, { authorization: 'Bearer ' }]) {
      await expect(guard.canActivate(contextFor(endpoints.protected, { headers }))).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(findSessionUser).not.toHaveBeenCalled();

    await expect(guard.canActivate(contextFor(endpoints.protected, bearer()))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findSessionUser).toHaveBeenCalledWith('tok');
  });

  it('attaches the session to the request', async () => {
    const { guard } = guardWith(session());
    const request = bearer();
    await expect(guard.canActivate(contextFor(endpoints.protected, request))).resolves.toBe(true);
    expect(request.auth).toEqual(session());
  });

  it('allows only password-change endpoints until the password is changed', async () => {
    const { guard } = guardWith(session({ mustChangePassword: true }));
    await expect(guard.canActivate(contextFor(endpoints.protected, bearer()))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(contextFor(endpoints.me, bearer()))).resolves.toBe(true);
  });

  it('requires one of the listed roles', async () => {
    await expect(guardWith(session()).guard.canActivate(contextFor(endpoints.admin, bearer()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      guardWith(session({ roles: ['TEACHER', 'CENTER_ADMIN'] })).guard.canActivate(contextFor(endpoints.admin, bearer())),
    ).resolves.toBe(true);
  });
});
