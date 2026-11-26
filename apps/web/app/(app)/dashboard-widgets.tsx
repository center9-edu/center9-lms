import Link from 'next/link';
import type { ReactNode } from 'react';
import { CLASS_STATUS_LABELS, CLASS_STATUS_TONES } from '../lib/demo-data';
import type { ClassStatus, DemoClass, UpcomingSession } from '../lib/demo-data';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/icons';
import type { IconName } from '../ui/icons';
import { CARD, FOCUS, OUTLINE_BUTTON } from '../ui/styles';

/** `demo` marks widgets fed by app/lib/demo-data.ts. `action` is the "Xem tất cả" link in the corner. */
export function Widget({
  title,
  icon,
  demo,
  action,
  children,
}: {
  title: string;
  icon?: IconName;
  demo?: boolean;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`${CARD} grid content-start gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
          {icon && <Icon name={icon} className="size-5 text-primary" />}
          {title}
          {demo && <Badge tone="warning">Demo</Badge>}
        </h2>
        {action && (
          <Link href={action.href} className={`flex items-center gap-1 rounded text-sm font-semibold text-primary no-underline hover:underline ${FOCUS}`}>
            {action.label}
            <Icon name="chevron-right" className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const dayFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const weekdayFormat = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

/** Upcoming sessions as rich rows: a date block, the class, then labelled time and room (like the reference's course rows). */
export function SessionRows({ items, linkToClass, empty }: { items: UpcomingSession[]; linkToClass: boolean; empty: string }) {
  if (items.length === 0) {
    return <p className="m-0 text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {items.map(({ demoClass, session }) => (
        <li key={session.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-solid border-border p-3 sm:p-4">
          <time
            dateTime={session.startsAt.toISOString()}
            className="grid w-14 shrink-0 justify-items-center rounded-xl bg-primary-50 py-2 text-primary"
          >
            <span className="text-xs font-semibold">{weekdayFormat.format(session.startsAt)}</span>
            <span className="text-xl leading-tight font-bold">{dayFormat.format(session.startsAt)}</span>
          </time>
          <div className="min-w-0 flex-1 basis-48">
            <p className="m-0 font-semibold">{demoClass.name}</p>
            <p className="m-0 text-sm text-muted">{session.title}</p>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="text-muted">Giờ học</dt>
              <dd className="m-0 flex items-center gap-1.5 font-medium">
                <Icon name="clock" className="size-4 text-muted" />
                {timeFormat.format(session.startsAt)}–{timeFormat.format(session.endsAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Phòng</dt>
              <dd className="m-0 flex items-center gap-1.5 font-medium">
                <Icon name="map-pin" className="size-4 text-muted" />
                {session.location}
              </dd>
            </div>
          </dl>
          {linkToClass && (
            <Link href="/lop-hoc" className={`${OUTLINE_BUTTON} px-4 py-2 text-sm`}>
              Xem lớp
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

const RING_RADIUS = 40;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** A ring like the reference's daily goal; the percentage and the counts are text, so nothing relies on the drawing alone. */
export function AttendanceRate({ attended, total, who }: { attended: number; total: number; who?: string }) {
  if (total === 0) {
    return <p className="m-0 text-sm text-muted">Chưa có buổi học nào được điểm danh.</p>;
  }
  const percent = Math.round((attended / total) * 100);
  return (
    <div
      role="meter"
      aria-label={`Chuyên cần${who ? ` của ${who}` : ''}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%, ${attended}/${total} buổi có mặt`}
      className="flex items-center gap-4"
    >
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 100 100" aria-hidden className="size-full -rotate-90">
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="10" className="stroke-surface" />
          {/* Neutral color: there is no agreed attendance threshold to judge against. */}
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(percent / 100) * RING_LENGTH} ${RING_LENGTH}`}
            className="stroke-primary"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xl font-bold">{percent}%</span>
      </div>
      <p className="m-0 text-sm text-muted">
        {who && <span className="block font-semibold text-foreground">{who}</span>}
        {attended}/{total} buổi có mặt
      </p>
    </div>
  );
}

/** Today's sessions as a timeline: start time on the left, the session on the right (like the reference's "Upcoming"). */
export function TodayTimeline({ items }: { items: UpcomingSession[] }) {
  if (items.length === 0) {
    return <p className="m-0 text-sm text-muted">Hôm nay không có buổi nào.</p>;
  }
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {items.map(({ demoClass, session }) => (
        <li key={session.id} className="grid grid-cols-[3rem_1fr] gap-3">
          <time dateTime={session.startsAt.toISOString()} className="pt-2 text-sm font-semibold text-muted">
            {timeFormat.format(session.startsAt)}
          </time>
          <div className="rounded-xl border-0 border-l-4 border-solid border-primary bg-primary-50 px-3 py-2">
            <p className="m-0 text-sm font-semibold">{demoClass.name}</p>
            <p className="m-0 text-xs text-muted">
              {timeFormat.format(session.startsAt)}–{timeFormat.format(session.endsAt)} · {session.location}
            </p>
          </div>
        </li>
      ))}
    </ol>
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
