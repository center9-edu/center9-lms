import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AllowPendingPasswordChange, CurrentSession, Public } from './auth.decorators.js';
import type { AuthContext, LoginResultDto, SessionUserDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

// Sanity bounds, not a password policy: they cap the work scrypt does for one request.
const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 128;

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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown): Promise<LoginResultDto> {
    const { username, password } = parseLoginRequest(body);
    return this.auth.login(username, password);
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
}
