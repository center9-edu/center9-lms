'use client';

import { PRIMARY_BUTTON } from '../ui/styles';

export default function PracticeError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto box-border w-full max-w-3xl px-6 py-10">
      <h1 className="m-0 mb-2 text-[1.75rem] leading-snug font-bold">Hệ thống đang bận một chút</h1>
      <p className="m-0 mb-8 text-muted">Em thử tải lại sau ít phút nhé.</p>
      <button type="button" className={PRIMARY_BUTTON} onClick={() => retry()}>
        Thử lại
      </button>
    </main>
  );
}
