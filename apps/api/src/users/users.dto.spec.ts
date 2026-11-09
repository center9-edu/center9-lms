import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseBody } from '../parse-body.js';
import { createUserSchema, setRolesSchema, setStatusSchema } from './users.dto.js';

// Mock request bodies. Fake accounts only: real users are children, never copy their data here.
const CREATE_STUDENT_BODY = { username: '  HS.Minh_2014 ', fullName: '  Nguyễn Văn Minh ', roles: ['STUDENT'] };
const CREATE_TEACHER_BODY = { username: 'gv.lan', fullName: 'Trần Thị Lan', roles: ['TEACHER'] };
const CREATE_PARENT_BODY = { username: 'ph.minh', fullName: 'Nguyễn Văn Hùng', roles: ['PARENT'] };
const CREATE_SALES_TEACHER_BODY = { username: 'nv-ha', fullName: 'Lê Thu Hà', roles: ['SALES', 'TEACHER'] };

const USERNAME_ERROR = 'username must be 3-32 characters of a-z, 0-9, ".", "_" or "-"';
const FULL_NAME_ERROR = 'fullName must be a non-empty string of at most 100 characters';
const ROLES_ERROR = /^roles must be a non-empty list of distinct values from: /;
const STATUS_ERROR = /^status must be one of: /;

describe('createUserSchema', () => {
  it('trims and lowercases the username and trims the full name', () => {
    expect(parseBody(createUserSchema, CREATE_STUDENT_BODY)).toEqual({
      username: 'hs.minh_2014',
      fullName: 'Nguyễn Văn Minh',
      roles: ['STUDENT'],
    });
  });

  it.each([CREATE_TEACHER_BODY, CREATE_PARENT_BODY, CREATE_SALES_TEACHER_BODY])('accepts $username', (body) => {
    expect(parseBody(createUserSchema, body)).toEqual(body);
  });

  it.each<[string, unknown, string | RegExp]>([
    ['no body', undefined, USERNAME_ERROR],
    ['a username that is too short', { ...CREATE_TEACHER_BODY, username: 'ab' }, USERNAME_ERROR],
    ['a username with Vietnamese diacritics', { ...CREATE_TEACHER_BODY, username: 'gv.lân' }, USERNAME_ERROR],
    ['a username with an inner space', { ...CREATE_TEACHER_BODY, username: 'gv lan' }, USERNAME_ERROR],
    ['a username over 32 characters', { ...CREATE_TEACHER_BODY, username: 'a'.repeat(33) }, USERNAME_ERROR],
    ['a blank full name', { ...CREATE_TEACHER_BODY, fullName: '   ' }, FULL_NAME_ERROR],
    ['a full name over 100 characters', { ...CREATE_TEACHER_BODY, fullName: 'A'.repeat(101) }, FULL_NAME_ERROR],
    ['no roles', { ...CREATE_TEACHER_BODY, roles: [] }, ROLES_ERROR],
    ['duplicate roles', { ...CREATE_TEACHER_BODY, roles: ['TEACHER', 'TEACHER'] }, ROLES_ERROR],
    ['an unknown role', { ...CREATE_TEACHER_BODY, roles: ['ADMIN'] }, ROLES_ERROR],
    ['roles that are not a list', { ...CREATE_TEACHER_BODY, roles: 'TEACHER' }, ROLES_ERROR],
  ])('rejects %s', (_case, body, message) => {
    expect(() => parseBody(createUserSchema, body)).toThrow(message);
  });
});

describe('setRolesSchema and setStatusSchema', () => {
  it('accept valid bodies', () => {
    expect(parseBody(setRolesSchema, { roles: ['TEACHER', 'SALES'] })).toEqual({ roles: ['TEACHER', 'SALES'] });
    expect(parseBody(setStatusSchema, { status: 'LOCKED' })).toEqual({ status: 'LOCKED' });
  });

  it('reject invalid bodies with a 400', () => {
    expect(() => parseBody(setRolesSchema, {})).toThrow(ROLES_ERROR);
    expect(() => parseBody(setStatusSchema, { status: 'DELETED' })).toThrow(STATUS_ERROR);
    expect(() => parseBody(setStatusSchema, { status: 'active' })).toThrow(BadRequestException);
  });
});
