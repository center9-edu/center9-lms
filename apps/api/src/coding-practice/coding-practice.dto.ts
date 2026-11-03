export const RUN_MODES = ['run', 'submit'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export interface ProblemSummaryDto {
  slug: string;
  title: string;
  level: string;
  summary: string;
}

export interface ProblemDetailDto extends ProblemSummaryDto {
  statement: string[];
  hints: string[];
  starterCode: string;
  examples: { input: string; output: string }[];
}

export type TestVerdict = 'passed' | 'wrong_answer' | 'time_limit' | 'runtime_error';

export interface TestResultDto {
  verdict: TestVerdict;
  hidden: boolean;
  // Omitted for hidden tests, so that their contents cannot leak to students.
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  errorOutput?: string;
}

export interface RunResultDto {
  passedCount: number;
  totalCount: number;
  tests: TestResultDto[];
}
