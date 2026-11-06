import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { AllowPendingPasswordChange, CurrentSession, Public } from './auth.decorators.js';
import type { AuthContext, LoginResultDto, SessionUserDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

// The upper bounds also cap the work scrypt does for one request.
const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 128;
const MIN_NEW_PASSWORD_LENGTH = 8;

function parseLoginRequest(body: unknown): { username: string; password: string } {
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== 'string' || username.trim() === '' || username.length > MAX_USERNAME_LENGTH) {
    throw new BadRequestException(`username must be a non-empty string of at most ${MAX_USERNAME_LENGTH} characters`);
  }
  if (typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(`password must be a non-empty string of at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  return { username, password };
}

function parseChangePasswordRequest(body: unknown): { currentPassword: string; newPassword: string } {
  const { currentPassword, newPassword } = (body ?? {}) as Record<string, unknown>;
  if (typeof currentPassword !== 'string' || currentPassword === '' || currentPassword.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(`currentPassword must be a non-empty string of at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_NEW_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(`newPassword must be ${MIN_NEW_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long`);
  }
  return { currentPassword, newPassword };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // x-client-ip is set by apps/web. The API must only be reachable from apps/web, or clients could forge it.
  login(
    @Body() body: unknown,
    @Headers('x-client-ip') forwardedIp: string | undefined,
    @Ip() connectionIp: string,
  ): Promise<LoginResultDto> {
    const { username, password } = parseLoginRequest(body);
    return this.auth.login(username, password, forwardedIp || connectionIp);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentSession() session: AuthContext): SessionUserDto {
    return session.user;
  }

  @AllowPendingPasswordChange()
  @Post('logout')
  @HttpCode(204)
  logout(@CurrentSession() session: AuthContext): Promise<void> {
    return this.auth.logout(session);
  }

  @AllowPendingPasswordChange()
  @Post('password')
  @HttpCode(204)
  changePassword(@CurrentSession() session: AuthContext, @Body() body: unknown): Promise<void> {
    const { currentPassword, newPassword } = parseChangePasswordRequest(body);
    return this.auth.changePassword(session, currentPassword, newPassword);
  }
}
