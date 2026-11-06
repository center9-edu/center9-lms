import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { RUN_MODES } from './coding-practice.dto.js';
import type { RunMode } from './coding-practice.dto.js';
import { CodingPracticeService } from './coding-practice.service.js';

const MAX_CODE_LENGTH = 10_000;

function parseRunRequest(body: unknown): { code: string; mode: RunMode } {
  const { code, mode } = (body ?? {}) as Record<string, unknown>;
  if (typeof code !== 'string' || code.trim() === '' || code.length > MAX_CODE_LENGTH) {
    throw new BadRequestException(`code must be a non-empty string of at most ${MAX_CODE_LENGTH} characters`);
  }
  const runMode = RUN_MODES.find((candidate) => candidate === mode);
  if (!runMode) {
    throw new BadRequestException(`mode must be one of: ${RUN_MODES.join(', ')}`);
  }
  return { code, mode: runMode };
}

@Public()
@Controller('coding-practice/problems')
export class CodingPracticeController {
  constructor(private readonly practice: CodingPracticeService) {}

  @Get()
  list() {
    return this.practice.listProblems();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.practice.getProblem(slug);
  }

  // x-client-ip is set by apps/web. The API must only be reachable from apps/web, or clients could forge it.
  @Post(':slug/runs')
  @HttpCode(200)
  run(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Headers('x-client-ip') forwardedIp: string | undefined,
    @Ip() connectionIp: string,
  ) {
    const { code, mode } = parseRunRequest(body);
    return this.practice.run(slug, code, mode, forwardedIp || connectionIp);
  }
}
