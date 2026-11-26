// Moments shown and edited as Vietnam time, where every class takes place. No server-only imports: client forms use it too.

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Weekdays as the API's schedule takes them (ISO): 1 = Monday, which Vietnamese call "Thứ 2", … 7 = Sunday. */
export const WEEKDAYS = [
  { value: 1, label: 'Thứ 2' },
  { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' },
  { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' },
  { value: 6, label: 'Thứ 7' },
  { value: 7, label: 'Chủ nhật' },
] as const;

/** "2026-12-01T11:00:00.000Z" → { date: "2026-12-01", time: "18:00" }: what <input type="date"> and "time" take. */
export function vietnamDateTime(iso: string): { date: string; time: string } {
  // sv-SE formats as "2026-12-01 18:00:00".
  const [date = '', time = ''] = new Date(iso).toLocaleString('sv-SE', { timeZone: TIME_ZONE }).split(' ');
  return { date, time: time.slice(0, 5) };
}

/** "Thứ 3, 01/12/2026 · 18:00–19:30". */
export function formatSessionTime(startsAt: string, endsAt: string): string {
  const start = vietnamDateTime(startsAt);
  const [year, month, day] = start.date.split('-');
  // A calendar day read at UTC midnight has the same weekday everywhere; getUTCDay counts Sunday as 0.
  const isoWeekday = ((new Date(`${start.date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const weekday = WEEKDAYS.find(({ value }) => value === isoWeekday)?.label ?? '';
  return `${weekday}, ${day}/${month}/${year} · ${start.time}–${vietnamDateTime(endsAt).time}`;
}
