'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Badge } from '../../ui/badge';
import { FOCUS, OUTLINE_BUTTON, PRIMARY_BUTTON } from '../../ui/styles';
import { markCompleted } from '../progress';
import type { ProblemDetail, RunMode, RunResult, TestResult, TestVerdict } from '../types';
import { runCode } from './actions';
import { CodeEditor } from './code-editor';

const VERDICT_LABELS: Record<TestVerdict, string> = {
  passed: '✓ Đạt',
  wrong_answer: '✗ Kết quả chưa đúng',
  time_limit: '✗ Chạy quá lâu, có thể vòng lặp chưa dừng',
  runtime_error: '✗ Chương trình gặp lỗi',
};

const ERROR_EXPLANATIONS: [string, string][] = [
  ['IndentationError', 'Có dòng code chưa thụt đầu dòng đúng. Hãy kiểm tra khoảng trắng ở đầu dòng.'],
  ['TabError', 'Có dòng code chưa thụt đầu dòng đúng. Hãy kiểm tra khoảng trắng ở đầu dòng.'],
  ['SyntaxError', 'Python chưa hiểu cách viết này. Hãy kiểm tra dấu ngoặc, dấu hai chấm và dấu ngoặc kép.'],
  ['NameError', 'Có tên biến chưa được tạo hoặc bị viết sai chính tả.'],
  ['TypeError', 'Em đang dùng sai kiểu dữ liệu, ví dụ cộng chữ với số. Thử đổi kiểu bằng int() hoặc str().'],
  ['ValueError', 'Python không đổi được giá trị này, ví dụ đổi chữ thành số bằng int().'],
  ['ZeroDivisionError', 'Máy tính không thể chia cho 0.'],
  ['EOFError', 'Chương trình đang đọc nhiều input() hơn dữ liệu được cho.'],
];

const TEXT_BUTTON = `cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2.5 font-[inherit] text-base text-muted underline disabled:cursor-wait disabled:opacity-60 ${FOCUS}`;
const MESSAGE = 'm-0 my-2 rounded-lg px-3.5 py-2.5 font-semibold';
const OUTPUT_GRID = 'mb-2 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2';
const SECTION_HEADING = 'm-0 mt-6 mb-2 text-[1.0625rem] font-bold';

function explainError(errorOutput: string): string | undefined {
  return ERROR_EXPLANATIONS.find(([name]) => errorOutput.includes(name))?.[1];
}

function summarize(result: RunResult, mode: RunMode): string {
  const remaining = result.totalCount - result.passedCount;
  if (remaining === 0) {
    return mode === 'submit'
      ? `Tuyệt vời! Em đã vượt qua cả ${result.totalCount} test.`
      : 'Các ví dụ đều đúng rồi! Bấm Nộp bài để thử thêm các test ẩn nhé.';
  }
  return result.passedCount > 0
    ? `Gần đúng rồi, còn ${remaining} test chưa đạt. Cố lên nhé!`
    : 'Chưa đúng lắm. Em xem lại từng test bên dưới rồi thử lại nhé!';
}

function testLabel(tests: TestResult[], index: number): string {
  const { hidden } = tests[index];
  const number = tests.slice(0, index + 1).filter((test) => test.hidden === hidden).length;
  return hidden ? `Test ẩn ${number}` : `Ví dụ ${number}`;
}

function OutputBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="m-0 mt-2 mb-0.5 text-[0.8125rem] text-muted">{label}</p>
      <pre className="m-0 rounded-md bg-surface px-2.5 py-2 text-sm whitespace-pre-wrap wrap-anywhere">{text || '(không có gì)'}</pre>
    </div>
  );
}

function TestRow({ test, label }: { test: TestResult; label: string }) {
  const explanation = test.errorOutput ? explainError(test.errorOutput) : undefined;
  return (
    <li className="rounded-lg border border-solid border-border px-3 py-2">
      <p className={`m-0 ${test.verdict === 'passed' ? 'text-success' : 'text-danger'}`}>
        <strong>{label}:</strong> {VERDICT_LABELS[test.verdict]}
      </p>
      {!test.hidden && test.verdict !== 'passed' && (
        <>
          {explanation && <p className="m-0 my-1.5">{explanation}</p>}
          <div className={OUTPUT_GRID}>
            <OutputBlock label="Dữ liệu vào" text={test.input ?? ''} />
            <OutputBlock label="Kết quả mong muốn" text={test.expectedOutput ?? ''} />
            <OutputBlock label="Chương trình của em in ra" text={test.actualOutput ?? ''} />
          </div>
          {test.errorOutput && <OutputBlock label="Thông báo lỗi của Python" text={test.errorOutput} />}
        </>
      )}
    </li>
  );
}

interface WorkspaceProps {
  problem: ProblemDetail;
  nextSlug?: string;
  trialSignupUrl?: string;
}

export function Workspace({ problem, nextSlug, trialSignupUrl }: WorkspaceProps) {
  const [code, setCode] = useState(problem.starterCode);
  const [editorKey, setEditorKey] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [outcome, setOutcome] = useState<{ result: RunResult; mode: RunMode } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<RunMode | null>(null);
  const [isPending, startTransition] = useTransition();

  const execute = (mode: RunMode) => {
    setActiveMode(mode);
    setErrorMessage(null);
    setOutcome(null);
    startTransition(async () => {
      const response = await runCode(problem.slug, code, mode);
      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }
      setOutcome({ result: response.result, mode });
      if (mode === 'submit' && response.result.passedCount === response.result.totalCount) {
        markCompleted(problem.slug);
      }
    });
  };

  const resetCode = () => {
    setCode(problem.starterCode);
    setEditorKey((key) => key + 1);
  };

  const solved =
    outcome?.mode === 'submit' && outcome.result.passedCount === outcome.result.totalCount;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 min-[56rem]:grid-cols-[minmax(20rem,2fr)_minmax(0,3fr)]">
      <section
        className="border-0 border-b border-solid border-border px-6 pt-5 pb-8 wrap-anywhere min-[56rem]:border-r min-[56rem]:border-b-0"
        aria-labelledby="problem-title"
      >
        <Link href="/luyen-tap" className={`rounded text-[0.9375rem] text-primary underline ${FOCUS}`}>
          ← Danh sách bài
        </Link>
        <h1 id="problem-title" className="m-0 mt-3 mb-1 text-2xl leading-snug font-bold">
          {problem.title}
        </h1>
        <Badge>{problem.level}</Badge>
        {problem.statement.map((paragraph) => (
          <p key={paragraph} className="m-0 my-4">
            {paragraph}
          </p>
        ))}

        <h2 className={SECTION_HEADING}>Ví dụ</h2>
        {problem.examples.map((example, index) => (
          <div key={example.input} className={OUTPUT_GRID}>
            <OutputBlock label={`Ví dụ ${index + 1}: dữ liệu vào`} text={example.input} />
            <OutputBlock label="Kết quả in ra" text={example.output} />
          </div>
        ))}

        <h2 className={SECTION_HEADING}>Gợi ý</h2>
        {problem.hints.slice(0, hintsShown).map((hint) => (
          <p key={hint} className="m-0 my-4 border-0 border-l-[3px] border-solid border-primary bg-surface px-3 py-2">
            {hint}
          </p>
        ))}
        {hintsShown < problem.hints.length ? (
          <button type="button" className={OUTLINE_BUTTON} onClick={() => setHintsShown(hintsShown + 1)}>
            {hintsShown === 0 ? 'Xem gợi ý' : 'Xem gợi ý tiếp theo'}
          </button>
        ) : null}
      </section>

      <section className="flex min-w-0 flex-col gap-2 px-6 pt-5 pb-8" aria-label="Viết và chạy code">
        <CodeEditor key={editorKey} initialCode={problem.starterCode} onChange={setCode} />
        <p className="m-0 text-[0.8125rem] text-muted">Phím Tab dùng để thụt đầu dòng. Muốn rời ô code bằng bàn phím: nhấn Esc rồi Tab.</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" className={OUTLINE_BUTTON} disabled={isPending} onClick={() => execute('run')}>
            {isPending && activeMode === 'run' ? 'Đang chạy...' : 'Chạy thử'}
          </button>
          <button type="button" className={`${PRIMARY_BUTTON} py-2.5`} disabled={isPending} onClick={() => execute('submit')}>
            {isPending && activeMode === 'submit' ? 'Đang chấm...' : 'Nộp bài'}
          </button>
          <button type="button" className={TEXT_BUTTON} disabled={isPending} onClick={resetCode}>
            Khôi phục code ban đầu
          </button>
        </div>

        <div className="min-h-6" aria-live="polite">
          {errorMessage && <p className={`${MESSAGE} bg-danger-surface text-danger`}>{errorMessage}</p>}
          {outcome && (
            <>
              <p className={`${MESSAGE} ${solved ? 'bg-success-surface text-success' : 'bg-surface'}`}>{summarize(outcome.result, outcome.mode)}</p>
              <ul className="m-0 mb-3 grid list-none gap-2 p-0">
                {outcome.result.tests.map((test, index) => (
                  <TestRow
                    key={index}
                    test={test}
                    label={testLabel(outcome.result.tests, index)}
                  />
                ))}
              </ul>
            </>
          )}
          {solved && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {nextSlug ? (
                <Link href={`/luyen-tap/${nextSlug}`} className={`${PRIMARY_BUTTON} py-2.5`}>
                  Làm bài tiếp theo
                </Link>
              ) : (
                <p className="m-0">Em đã làm hết các bài thử rồi, giỏi lắm!</p>
              )}
              {trialSignupUrl && (
                <a href={trialSignupUrl} className={OUTLINE_BUTTON}>
                  Đăng ký học thử
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
