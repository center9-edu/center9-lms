import { createHash } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma.service.js';
import { Public, Roles } from './auth.decorators.js';

// Endpoints that exist only in this test, next to the real ones from AppModule.
@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  @Get('closed')
  closed() {
    return { ok: true };
  }

  @Roles('SUPER_ADMIN')
  @Get('admin')
  admin() {
    return { ok: true };
  }
}

const TEACHER_TOKEN = 'teacher-token';
const PENDING_TOKEN = 'pending-token';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function sessionFor(mustChangePassword: boolean) {
  return {
    id: `session-${mustChangePassword}`,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    user: {
      id: `user-${mustChangePassword}`,
      username: 'gv.lan',
      fullName: 'Lan',
      status: 'ACTIVE',
      mustChangePassword,
      roles: [{ role: 'TEACHER' }],
    },
  };
}

const sessions = new Map([
  [sha256(TEACHER_TOKEN), sessionFor(false)],
  [sha256(PENDING_TOKEN), sessionFor(true)],
]);

const prisma = {
  authSession: {
    findUnique: async ({ where }: { where: { tokenHash: string } }) => sessions.get(where.tokenHash) ?? null,
    update: async () => ({}),
  },
};

describe('AuthModule wiring (default deny)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const status = async (path: string, token?: string) =>
    (await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;

  it('keeps public endpoints open without a token', async () => {
    expect(await status('/health')).toBe(200);
    expect(await status('/coding-practice/problems')).toBe(200);
    expect(await status('/probe/open')).toBe(200);
  });

  it('requires a session everywhere else', async () => {
    expect(await status('/probe/closed')).toBe(401);
    expect(await status('/auth/me')).toBe(401);
    expect(await status('/probe/closed', 'unknown-token')).toBe(401);
    expect(await status('/probe/closed', TEACHER_TOKEN)).toBe(200);
    expect(await status('/auth/me', TEACHER_TOKEN)).toBe(200);
  });

  it('enforces @Roles', async () => {
    expect(await status('/probe/admin', TEACHER_TOKEN)).toBe(403);
  });

  it('allows only password-change endpoints while a temporary password is in use', async () => {
    expect(await status('/probe/closed', PENDING_TOKEN)).toBe(403);
    expect(await status('/auth/me', PENDING_TOKEN)).toBe(200);
  });
});
