import { Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { parseBody } from '../parse-body.js';
import { AllowPendingPasswordChange, CurrentSession, Public } from './auth.decorators.js';
import { changePasswordSchema, loginSchema } from './auth.dto.js';
import type { AuthContext, LoginResultDto, SessionUserDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

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
    const { username, password } = parseBody(loginSchema, body);
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
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, body);
    return this.auth.changePassword(session, currentPassword, newPassword);
  }
}
