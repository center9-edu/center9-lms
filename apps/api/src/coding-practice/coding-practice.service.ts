import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ProblemDetailDto, ProblemSummaryDto, RunMode, RunResultDto, TestResultDto, TestVerdict } from './coding-practice.dto.js';
import { Judge0Client } from './judge0.client.js';
import type { Judge0Result } from './judge0.client.js';
import { PROBLEMS } from './problems.js';
import type { PracticeProblem, PracticeTest } from './problems.js';

// A whole class can share one IP address, so tune these before a real campaign.
const RUNS_PER_MINUTE_PER_IP = 10;
const MAX_CONCURRENT_RUNS = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;
const MAX_OUTPUT_LENGTH = 2_000;

const VERDICT_BY_STATUS_ID = new Map<number, TestVerdict>([
  [3, 'passed'],
  [4, 'wrong_answer'],
  [5, 'time_limit'],
  [6, 'runtime_error'],
  [7, 'runtime_error'],
  [8, 'runtime_error'],
  [9, 'runtime_error'],
  [10, 'runtime_error'],
  [11, 'runtime_error'],
  [12, 'runtime_error'],
]);

const truncate = (text: string) => (text.length > MAX_OUTPUT_LENGTH ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n...` : text);

@Injectable()
export class CodingPracticeService {
  private readonly logger = new Logger(CodingPracticeService.name);
  // ponytail: in-memory limits are only correct for one API instance; move to a shared store when scaling out.
  private readonly runsByIp = new Map<string, { windowStart: number; count: number }>();
  private activeRuns = 0;

  constructor(private readonly judge0: Judge0Client) {}

  listProblems(): ProblemSummaryDto[] {
    return PROBLEMS.map((problem) => this.toSummary(problem));
  }

  getProblem(slug: string): ProblemDetailDto {
    const problem = this.findProblem(slug);
    return {
      ...this.toSummary(problem),
      statement: problem.statement,
      hints: problem.hints,
      starterCode: problem.starterCode,
      examples: problem.tests
        .filter((test) => !test.hidden)
        .map((test) => ({ input: test.stdin, output: test.expectedOutput })),
    };
  }

  async run(slug: string, code: string, mode: RunMode, clientIp: string): Promise<RunResultDto> {
    const problem = this.findProblem(slug);
    this.enforceLimits(clientIp);
    const tests = mode === 'submit' ? problem.tests : problem.tests.filter((test) => !test.hidden);

    this.activeRuns += 1;
    try {
      const results = await this.judge0.run(code, tests);
      const testResults = results.map((result, index) => this.toTestResult(tests[index], result));
      return {
        passedCount: testResults.filter((test) => test.verdict === 'passed').length,
        totalCount: testResults.length,
        tests: testResults,
      };
    } catch (error) {
      // Log only the message: never the submitted code, which may contain personal information.
      this.logger.error(`Code run failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new ServiceUnavailableException('Code runner is unavailable');
    } finally {
      this.activeRuns -= 1;
    }
  }

  private findProblem(slug: string): PracticeProblem {
    const problem = PROBLEMS.find((candidate) => candidate.slug === slug);
    if (!problem) {
      throw new NotFoundException('Problem not found');
    }
    return problem;
  }

  private enforceLimits(clientIp: string): void {
    const now = Date.now();
    if (this.runsByIp.size > MAX_TRACKED_IPS) {
      for (const [ip, entry] of this.runsByIp) {
        if (now - entry.windowStart >= RATE_WINDOW_MS) this.runsByIp.delete(ip);
      }
    }
    if (this.activeRuns >= MAX_CONCURRENT_RUNS) {
      throw new HttpException('Too many concurrent runs', HttpStatus.TOO_MANY_REQUESTS);
    }
    const entry = this.runsByIp.get(clientIp);
    if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
      this.runsByIp.set(clientIp, { windowStart: now, count: 1 });
      return;
    }
    if (entry.count >= RUNS_PER_MINUTE_PER_IP) {
      throw new HttpException('Too many runs', HttpStatus.TOO_MANY_REQUESTS);
    }
    entry.count += 1;
  }

  private toTestResult(test: PracticeTest, result: Judge0Result): TestResultDto {
    const verdict = VERDICT_BY_STATUS_ID.get(result.statusId);
    if (!verdict) {
      throw new Error(`Judge0 returned status ${result.statusId}`);
    }
    if (test.hidden) {
      return { verdict, hidden: true };
    }
    return {
      verdict,
      hidden: false,
      input: test.stdin,
      expectedOutput: test.expectedOutput,
      actualOutput: truncate(result.stdout),
      errorOutput: truncate(result.stderr),
    };
  }

  private toSummary(problem: PracticeProblem): ProblemSummaryDto {
    return { slug: problem.slug, title: problem.title, level: problem.level, summary: problem.summary };
  }
}
