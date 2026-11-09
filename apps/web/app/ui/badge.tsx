import type { ReactNode } from 'react';

const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-surface text-success',
  danger: 'bg-danger-surface text-danger',
  muted: 'bg-surface text-muted',
};

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
