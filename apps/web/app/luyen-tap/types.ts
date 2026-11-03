// Mirrors the API responses of apps/api/src/coding-practice; apps only communicate over HTTP.

export interface ProblemSummary {
  slug: string;
  title: string;
  level: string;
  summary: string;
}

export interface ProblemDetail extends ProblemSummary {
  statement: string[];
  hints: string[];
  starterCode: string;
  examples: { input: string; output: string }[];
}

export type RunMode = 'run' | 'submit';
export type TestVerdict = 'passed' | 'wrong_answer' | 'time_limit' | 'runtime_error';

export interface TestResult {
  verdict: TestVerdict;
  hidden: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  errorOutput?: string;
}

export interface RunResult {
  passedCount: number;
  totalCount: number;
  tests: TestResult[];
}

export type RunActionResult = { ok: true; result: RunResult } | { ok: false; message: string };
