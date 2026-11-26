import type { ReactNode } from 'react';

const TONES = {
  primary: 'bg-primary-50 text-primary',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
  muted: 'bg-surface text-muted ring-1 ring-border ring-inset',
};

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
