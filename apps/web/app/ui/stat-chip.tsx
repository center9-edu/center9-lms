import { Icon } from './icons';
import type { IconName } from './icons';

const TONES = {
  primary: 'bg-primary-50 text-primary',
  accent: 'bg-accent/15 text-warning',
  success: 'bg-success-surface text-success',
  danger: 'bg-danger-surface text-danger',
};

export interface Stat {
  icon: IconName;
  value: string | number;
  label: string;
  tone?: keyof typeof TONES;
  /** Fed by app/lib/demo-data.ts: says so next to the label. */
  demo?: boolean;
}

/** A row of small figures with an icon, like the point/badge chips of the reference design. */
export function StatChips({ stats, label }: { stats: Stat[]; label: string }) {
  return (
    <dl aria-label={label} className="m-0 flex flex-wrap gap-3">
      {stats.map(({ icon, value, label: statLabel, tone = 'primary', demo }) => (
        <div key={statLabel} className="box-border flex min-w-40 items-center gap-3 rounded-2xl border border-solid border-border bg-white px-4 py-3 shadow-card">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>
            <Icon name={icon} />
          </span>
          <div className="flex flex-col-reverse">
            <dt className="text-sm text-muted">
              {statLabel}
              {demo && <span className="ml-1 text-xs font-semibold text-warning">· Demo</span>}
            </dt>
            <dd className="m-0 text-xl leading-tight font-bold">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
