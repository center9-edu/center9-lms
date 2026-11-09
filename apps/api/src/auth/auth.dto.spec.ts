import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseBody } from '../parse-body.js';
import { changePasswordSchema, loginSchema } from './auth.dto.js';

// Mock request bodies. Fake accounts only: real users are children, never copy their data here.
const LOGIN_BODY = { username: 'gv.lan', password: 'Lan@2026' };
const CHANGE_PASSWORD_BODY = { currentPassword: 'TamThoi-8x2k', newPassword: 'MatKhauMoi@2026' };

const USERNAME_ERROR = 'username must be a non-empty string of at most 100 characters';
const PASSWORD_ERROR = 'password must be a non-empty string of at most 128 characters';
const CURRENT_PASSWORD_ERROR = 'currentPassword must be a non-empty string of at most 128 characters';
const NEW_PASSWORD_ERROR = 'newPassword must be 8 to 128 characters long';

describe('loginSchema', () => {
  it('accepts a valid body and drops unknown fields', () => {
    expect(parseBody(loginSchema, { ...LOGIN_BODY, roles: ['SUPER_ADMIN'] })).toEqual(LOGIN_BODY);
  });

  it('keeps the username as sent, since AuthService.login normalizes it', () => {
    expect(parseBody(loginSchema, { ...LOGIN_BODY, username: '  GV.Lan ' }).username).toBe('  GV.Lan ');
  });

  it('throws a BadRequestException', () => {
    expect(() => parseBody(loginSchema, {})).toThrow(BadRequestException);
  });

  it.each<[string, unknown, string]>([
    ['no body', undefined, USERNAME_ERROR],
    ['an empty object', {}, USERNAME_ERROR],
    ['a blank username', { ...LOGIN_BODY, username: '   ' }, USERNAME_ERROR],
    ['a numeric username', { ...LOGIN_BODY, username: 12345 }, USERNAME_ERROR],
    ['a username over 100 characters', { ...LOGIN_BODY, username: 'a'.repeat(101) }, USERNAME_ERROR],
    ['a missing password', { username: 'gv.lan' }, PASSWORD_ERROR],
    ['an empty password', { ...LOGIN_BODY, password: '' }, PASSWORD_ERROR],
    ['a password over 128 characters', { ...LOGIN_BODY, password: 'x'.repeat(129) }, PASSWORD_ERROR],
  ])('rejects %s', (_case, body, message) => {
    expect(() => parseBody(loginSchema, body)).toThrow(message);
  });
});

describe('changePasswordSchema', () => {
  it('accepts a valid body', () => {
    expect(parseBody(changePasswordSchema, CHANGE_PASSWORD_BODY)).toEqual(CHANGE_PASSWORD_BODY);
  });

  it.each<[string, unknown, string]>([
    ['an empty object', {}, CURRENT_PASSWORD_ERROR],
    ['an empty current password', { ...CHANGE_PASSWORD_BODY, currentPassword: '' }, CURRENT_PASSWORD_ERROR],
    ['a new password of 7 characters', { ...CHANGE_PASSWORD_BODY, newPassword: 'Ngan@12' }, NEW_PASSWORD_ERROR],
    ['a new password over 128 characters', { ...CHANGE_PASSWORD_BODY, newPassword: 'x'.repeat(129) }, NEW_PASSWORD_ERROR],
    ['a numeric new password', { ...CHANGE_PASSWORD_BODY, newPassword: 12345678 }, NEW_PASSWORD_ERROR],
  ])('rejects %s', (_case, body, message) => {
    expect(() => parseBody(changePasswordSchema, body)).toThrow(message);
  });
});
