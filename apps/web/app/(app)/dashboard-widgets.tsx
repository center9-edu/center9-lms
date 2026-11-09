import Link from 'next/link';
import type { ReactNode } from 'react';
import { CLASS_STATUS_LABELS, CLASS_STATUS_TONES } from '../lib/demo-data';
import type { ClassStatus, DemoClass, UpcomingSession } from '../lib/demo-data';
import { Badge } from '../ui/badge';
import { CARD, FOCUS } from '../ui/styles';

const sessionFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** `demo` marks widgets fed by app/lib/demo-data.ts. */
export function Widget({ title, demo, children }: { title: string; demo?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={`${CARD} grid content-start gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">{title}</h2>
        {demo && <Badge>Demo</Badge>}
      </div>
      {children}
    </section>
  );
}

export function UpcomingList({ items, linkToClass, empty }: { items: UpcomingSession[]; linkToClass: boolean; empty: string }) {
  if (items.length === 0) {
    return <p className="m-0 text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {items.map(({ demoClass, session }) => (
        <li key={session.id} className="border-0 border-b border-solid border-border pb-2 last:border-b-0 last:pb-0">
          <p className="m-0 text-sm font-semibold text-primary">{sessionFormat.format(session.startsAt)}</p>
          <p className="m-0">
            {linkToClass ? (
              <Link href={`/lop-hoc/${demoClass.code}`} className={`rounded text-foreground underline ${FOCUS}`}>
                {demoClass.name}
              </Link>
            ) : (
              demoClass.name
            )}
          </p>
          <p className="m-0 text-sm text-muted">
            {session.title} · {session.location}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function AttendanceRate({ attended, total, who }: { attended: number; total: number; who?: string }) {
  if (total === 0) {
    return <p className="m-0 text-sm text-muted">Chưa có buổi học nào được điểm danh.</p>;
  }
  const percent = Math.round((attended / total) * 100);
  return (
    <div className="grid gap-2">
      <p className="m-0">
        {who && <span className="block text-sm text-muted">{who}</span>}
        <span className="text-3xl font-bold">{percent}%</span>{' '}
        <span className="text-sm text-muted">
          ({attended}/{total} buổi có mặt)
        </span>
      </p>
      <div
        role="meter"
        aria-label={`Chuyên cần${who ? ` của ${who}` : ''}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-surface"
      >
        {/* Neutral color: there is no agreed attendance threshold to judge against. */}
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ClassStatusCounts({ classes }: { classes: DemoClass[] }) {
  const counts = new Map<ClassStatus, number>();
  for (const demoClass of classes) {
    counts.set(demoClass.status, (counts.get(demoClass.status) ?? 0) + 1);
  }
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {[...counts].map(([status, count]) => (
        <li key={status}>
          <Badge tone={CLASS_STATUS_TONES[status]}>
            {CLASS_STATUS_LABELS[status]}: {count}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
