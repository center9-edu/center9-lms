'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import styles from '../practice.module.css';
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
      <p className={styles.outputLabel}>{label}</p>
      <pre className={styles.output}>{text || '(không có gì)'}</pre>
    </div>
  );
}

function TestRow({ test, label }: { test: TestResult; label: string }) {
  const explanation = test.errorOutput ? explainError(test.errorOutput) : undefined;
  return (
    <li className={styles.testRow}>
      <p className={test.verdict === 'passed' ? styles.testPassed : styles.testFailed}>
        <strong>{label}:</strong> {VERDICT_LABELS[test.verdict]}
      </p>
      {!test.hidden && test.verdict !== 'passed' && (
        <>
          {explanation && <p className={styles.explanation}>{explanation}</p>}
          <div className={styles.outputGrid}>
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
    <main className={styles.workspace}>
      <section className={styles.problemPane} aria-labelledby="problem-title">
        <Link href="/luyen-tap" className={styles.backLink}>
          ← Danh sách bài
        </Link>
        <h1 id="problem-title" className={styles.problemHeading}>
          {problem.title}
        </h1>
        <span className={styles.level}>{problem.level}</span>
        {problem.statement.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        <h2 className={styles.sectionHeading}>Ví dụ</h2>
        {problem.examples.map((example, index) => (
          <div key={example.input} className={styles.outputGrid}>
            <OutputBlock label={`Ví dụ ${index + 1}: dữ liệu vào`} text={example.input} />
            <OutputBlock label="Kết quả in ra" text={example.output} />
          </div>
        ))}

        <h2 className={styles.sectionHeading}>Gợi ý</h2>
        {problem.hints.slice(0, hintsShown).map((hint) => (
          <p key={hint} className={styles.hint}>
            {hint}
          </p>
        ))}
        {hintsShown < problem.hints.length ? (
          <button type="button" className={styles.secondaryButton} onClick={() => setHintsShown(hintsShown + 1)}>
            {hintsShown === 0 ? 'Xem gợi ý' : 'Xem gợi ý tiếp theo'}
          </button>
        ) : null}
      </section>

      <section className={styles.codePane} aria-label="Viết và chạy code">
        <CodeEditor key={editorKey} initialCode={problem.starterCode} onChange={setCode} />
        <p className={styles.keyboardHint}>Phím Tab dùng để thụt đầu dòng. Muốn rời ô code bằng bàn phím: nhấn Esc rồi Tab.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} disabled={isPending} onClick={() => execute('run')}>
            {isPending && activeMode === 'run' ? 'Đang chạy...' : 'Chạy thử'}
          </button>
          <button type="button" className={styles.primaryButton} disabled={isPending} onClick={() => execute('submit')}>
            {isPending && activeMode === 'submit' ? 'Đang chấm...' : 'Nộp bài'}
          </button>
          <button type="button" className={styles.textButton} disabled={isPending} onClick={resetCode}>
            Khôi phục code ban đầu
          </button>
        </div>

        <div className={styles.results} aria-live="polite">
          {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
          {outcome && (
            <>
              <p className={solved ? styles.summarySuccess : styles.summary}>{summarize(outcome.result, outcome.mode)}</p>
              <ul className={styles.testList}>
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
            <div className={styles.actions}>
              {nextSlug ? (
                <Link href={`/luyen-tap/${nextSlug}`} className={styles.primaryButton}>
                  Làm bài tiếp theo
                </Link>
              ) : (
                <p>Em đã làm hết các bài thử rồi, giỏi lắm!</p>
              )}
              {trialSignupUrl && (
                <a href={trialSignupUrl} className={styles.secondaryButton}>
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
