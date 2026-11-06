import { Buffer } from 'node:buffer';
import { Injectable, Logger } from '@nestjs/common';

const PYTHON_LANGUAGE_ID = 71; // Python 3.8.1 in Judge0 CE v1.13.1.
// Fixed on the server so that clients can never raise them.
const CPU_TIME_LIMIT_SECONDS = 2;
const WALL_TIME_LIMIT_SECONDS = 5;
const MEMORY_LIMIT_KB = 128_000;

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 5_000;
const LAST_PENDING_STATUS_ID = 2; // 1 = In Queue, 2 = Processing.

export interface Judge0Test {
  stdin: string;
  expectedOutput: string;
}

export interface Judge0Result {
  statusId: number;
  stdout: string;
  stderr: string;
  timeSeconds: number | null;
}

interface RawSubmission {
  token: string;
  status: { id: number };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
}

const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const decode = (text: string | null) => (text ? Buffer.from(text, 'base64').toString('utf8') : '');
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class Judge0Client {
  private readonly logger = new Logger(Judge0Client.name);

  /** Runs the code once per test and returns results in test order. Throws if Judge0 cannot answer. */
  async run(code: string, tests: Judge0Test[]): Promise<Judge0Result[]> {
    const tokens = await this.createSubmissions(code, tests);
    try {
      const submissions = await this.waitForResults(tokens);
      return submissions.map((submission) => ({
        statusId: submission.status.id,
        stdout: decode(submission.stdout),
        stderr: decode(submission.stderr) || decode(submission.compile_output),
        timeSeconds: submission.time === null ? null : Number(submission.time),
      }));
    } finally {
      // Judge0 has no retention setting, and submitted code may contain personal information.
      await Promise.all(tokens.map((token) => this.deleteSubmission(token)));
    }
  }

  private async createSubmissions(code: string, tests: Judge0Test[]): Promise<string[]> {
    const source = encode(code);
    const response = await this.request('/submissions/batch?base64_encoded=true', {
      method: 'POST',
      body: JSON.stringify({
        submissions: tests.map((test) => ({
          language_id: PYTHON_LANGUAGE_ID,
          source_code: source,
          stdin: encode(test.stdin),
          expected_output: encode(test.expectedOutput),
          cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
          wall_time_limit: WALL_TIME_LIMIT_SECONDS,
          memory_limit: MEMORY_LIMIT_KB,
        })),
      }),
    });
    const created = (await response.json()) as { token?: string }[];
    const tokens = created.flatMap((item) => (item.token ? [item.token] : []));
    if (tokens.length !== tests.length) {
      await Promise.all(tokens.map((token) => this.deleteSubmission(token)));
      throw new Error('Judge0 rejected part of the batch');
    }
    return tokens;
  }

  private async waitForResults(tokens: string[]): Promise<RawSubmission[]> {
    const fields = 'token,status,stdout,stderr,compile_output,time';
    const path = `/submissions/batch?base64_encoded=true&fields=${fields}&tokens=${tokens.join(',')}`;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.request(path, { method: 'GET' });
      const { submissions } = (await response.json()) as { submissions: RawSubmission[] };
      if (submissions.every((submission) => submission.status.id > LAST_PENDING_STATUS_ID)) {
        return submissions;
      }
      await delay(POLL_INTERVAL_MS);
    }
    throw new Error('Timed out waiting for Judge0');
  }

  private async deleteSubmission(token: string): Promise<void> {
    try {
      await this.request(`/submissions/${token}?fields=token`, { method: 'DELETE' });
    } catch {
      this.logger.warn(`Could not delete Judge0 submission ${token}`);
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const baseUrl = process.env.JUDGE0_URL;
    if (!baseUrl) {
      throw new Error('JUDGE0_URL is not set');
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.JUDGE0_AUTHN_TOKEN ? { 'X-Auth-Token': process.env.JUDGE0_AUTHN_TOKEN } : {}),
        ...(process.env.JUDGE0_AUTHZ_TOKEN ? { 'X-Auth-User': process.env.JUDGE0_AUTHZ_TOKEN } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Judge0 responded with ${response.status}`);
    }
    return response;
  }
}
