import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma.service.js';
import { HealthController } from './health.controller.js';

async function setup(queryRaw: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn(queryRaw) } }],
  }).compile();
  moduleRef.useLogger(false);
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('live returns ok without querying the database', async () => {
    const queryRaw = vi.fn();
    const controller = await setup(queryRaw);
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('ready returns ok when the database responds', async () => {
    const controller = await setup(async () => [{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('ready returns 503 without exposing error details when the database fails', async () => {
    const controller = await setup(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret');
    });
    const error = await controller.ready().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const body = (error as ServiceUnavailableException).getResponse();
    expect(body).toEqual({ status: 'error', database: 'down' });
  });
});
