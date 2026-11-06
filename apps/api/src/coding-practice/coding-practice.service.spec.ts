import { Buffer } from 'node:buffer';
import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodingPracticeController } from './coding-practice.controller.js';
import { CodingPracticeService } from './coding-practice.service.js';
import { Judge0Client } from './judge0.client.js';
import { PROBLEMS } from './problems.js';

const PROBLEM = PROBLEMS[0];
const SAMPLE_COUNT = PROBLEM.tests.filter((test) => !test.hidden).length;
const IP = '203.0.113.1';

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Stubs Judge0: each poll is answered with the next status list; unknown calls fail the test. */
function stubJudge0(statusesPerPoll: number[][], stdout = 'Xin chào!\n') {
  const deleted: string[] = [];
  let poll = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const { submissions } = JSON.parse(String(init.body)) as { submissions: unknown[] };
      return json(submissions.map((_, index) => ({ token: `t${index}` })), 201);
    }
    if (init?.method === 'DELETE') {
      deleted.push(url.match(/submissions\/(\w+)/)?.[1] ?? '');
      return json({});
    }
    const statuses = statusesPerPoll[Math.min(poll++, statusesPerPoll.length - 1)];
    return json({
      submissions: statuses.map((id, index) => ({
        token: `t${index}`,
        status: { id },
        stdout: b64(stdout),
        stderr: id === 11 ? b64('NameError: secret-input') : null,
        compile_output: null,
        time: '0.01',
      })),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, deleted };
}

describe('coding practice', () => {
  let service: CodingPracticeService;
  let controller: CodingPracticeController;

  beforeEach(async () => {
    vi.stubEnv('JUDGE0_URL', 'http://judge0.internal:2358');
    const moduleRef = await Test.createTestingModule({
      controllers: [CodingPracticeController],
      providers: [CodingPracticeService, Judge0Client],
    }).compile();
    moduleRef.useLogger(false);
    service = moduleRef.get(CodingPracticeService);
    controller = moduleRef.get(CodingPracticeController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('never returns hidden tests from the problem endpoints', () => {
    const payload = JSON.stringify([service.listProblems(), PROBLEMS.map((problem) => service.getProblem(problem.slug))]);
    for (const test of PROBLEMS.flatMap((problem) => problem.tests).filter((candidate) => candidate.hidden)) {
      expect(payload).not.toContain(JSON.stringify(test.stdin));
    }
  });

  it('run mode executes only the sample tests', async () => {
    const { fetchMock } = stubJudge0([Array(SAMPLE_COUNT).fill(3)]);
    const result = await service.run(PROBLEM.slug, 'print(1)', 'run', IP);
    expect(result).toMatchObject({ passedCount: SAMPLE_COUNT, totalCount: SAMPLE_COUNT });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { submissions: unknown[] };
    expect(body.submissions).toHaveLength(SAMPLE_COUNT);
  });

  it('submit mode maps statuses and hides the contents of hidden tests', async () => {
    const statuses = [3, 4, 11, 5];
    stubJudge0([statuses], 'output-of-hidden-test');
    const result = await service.run(PROBLEM.slug, 'print(1)', 'submit', IP);
    expect(result.tests.map((test) => test.verdict)).toEqual(['passed', 'wrong_answer', 'runtime_error', 'time_limit']);
    expect(result.passedCount).toBe(1);
    expect(result.tests[0].actualOutput).toBe('output-of-hidden-test');
    expect(result.tests[2]).toEqual({ verdict: 'runtime_error', hidden: true });
    expect(result.tests[3]).toEqual({ verdict: 'time_limit', hidden: true });
  });

  it('polls until every submission has finished', async () => {
    vi.useFakeTimers();
    const { fetchMock } = stubJudge0([[1, 2], [3, 3]]);
    const pending = service.run(PROBLEM.slug, 'print(1)', 'run', IP);
    await vi.advanceTimersByTimeAsync(600);
    await expect(pending).resolves.toMatchObject({ passedCount: 2 });
    const polls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'GET');
    expect(polls).toHaveLength(2);
  });

  it('returns 503 and still deletes submissions when polling times out', async () => {
    vi.useFakeTimers();
    const { deleted } = stubJudge0([[1, 1]]);
    const pending = service.run(PROBLEM.slug, 'print(1)', 'run', IP).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await pending).toBeInstanceOf(ServiceUnavailableException);
    expect(deleted).toEqual(['t0', 't1']);
  });

  it('returns 503 and deletes submissions when Judge0 reports an internal error', async () => {
    const { deleted } = stubJudge0([[13, 3]]);
    await expect(service.run(PROBLEM.slug, 'print(1)', 'run', IP)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(deleted).toEqual(['t0', 't1']);
  });

  it('does not expose Judge0 details when it is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:2358')));
    const error = await service.run(PROBLEM.slug, 'print(1)', 'run', IP).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain('10.0.0.5');
  });

  it('returns 503 when JUDGE0_URL is missing', async () => {
    vi.stubEnv('JUDGE0_URL', '');
    await expect(service.run(PROBLEM.slug, 'print(1)', 'run', IP)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('deletes submissions after a successful run', async () => {
    const { deleted } = stubJudge0([Array(SAMPLE_COUNT).fill(3)]);
    await service.run(PROBLEM.slug, 'print(1)', 'run', IP);
    expect(deleted).toEqual(['t0', 't1']);
  });

  it('limits runs per IP with 429, without affecting other IPs', async () => {
    stubJudge0([Array(SAMPLE_COUNT).fill(3)]);
    for (let i = 0; i < 10; i += 1) {
      await service.run(PROBLEM.slug, 'print(1)', 'run', IP);
    }
    const error = await service.run(PROBLEM.slug, 'print(1)', 'run', IP).catch((e: unknown) => e);
    expect((error as HttpException).getStatus()).toBe(429);
    await expect(service.run(PROBLEM.slug, 'print(1)', 'run', '203.0.113.2')).resolves.toBeDefined();
  });

  it('returns 404 for an unknown problem', async () => {
    await expect(service.run('khong-co', 'print(1)', 'run', IP)).rejects.toBeInstanceOf(NotFoundException);
    expect(() => service.getProblem('khong-co')).toThrow(NotFoundException);
  });

  it.each([
    ['too long code', { code: 'x'.repeat(10_001), mode: 'run' }],
    ['blank code', { code: '   ', mode: 'run' }],
    ['non-string code', { code: 1, mode: 'run' }],
    ['unknown mode', { code: 'print(1)', mode: 'grade' }],
    ['missing body', undefined],
  ])('returns 400 for %s', (_name, body) => {
    expect(() => controller.run(PROBLEM.slug, body, undefined, IP)).toThrow(BadRequestException);
  });

  it('uses the forwarded IP for rate limiting when apps/web provides it', () => {
    const run = vi.spyOn(service, 'run').mockResolvedValue({ passedCount: 0, totalCount: 0, tests: [] });
    void controller.run(PROBLEM.slug, { code: 'print(1)', mode: 'run' }, '198.51.100.7', '127.0.0.1');
    expect(run).toHaveBeenCalledWith(PROBLEM.slug, 'print(1)', 'run', '198.51.100.7');
  });

  it('every problem has at least two sample and two hidden tests, within the batch limit', () => {
    for (const problem of PROBLEMS) {
      expect(problem.tests.filter((test) => !test.hidden).length).toBeGreaterThanOrEqual(2);
      expect(problem.tests.filter((test) => test.hidden).length).toBeGreaterThanOrEqual(2);
      expect(problem.tests.length).toBeLessThanOrEqual(5);
    }
  });
});
