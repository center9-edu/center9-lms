export interface CalendarDay {
  /** YYYY-MM-DD. */
  date: string;
  day: number;
  /** False for the padding days of the previous and next month. */
  inMonth: boolean;
  today: boolean;
  marked: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const vnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

/** The month around `now` in Vietnam time, as whole weeks from Monday to Sunday; `marked` days get a dot (e.g. sessions). */
export function monthGrid(now: Date, marked: Date[] = []): { year: number; month: number; weeks: CalendarDay[][] } {
  const today = vnDate.format(now);
  const [year = 0, month = 0] = today.split('-').map(Number);
  const markedDates = new Set(marked.map((date) => vnDate.format(date)));
  // Calendar arithmetic in UTC: these are dates, not instants, so no time zone can shift them.
  const first = Date.UTC(year, month - 1, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (new Date(first).getUTCDay() + 6) % 7;
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const days = Array.from({ length: cells }, (_, index): CalendarDay => {
    const date = new Date(first + (index - leading) * DAY_MS);
    const iso = date.toISOString().slice(0, 10);
    return {
      date: iso,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
      today: iso === today,
      marked: markedDates.has(iso),
    };
  });
  const weeks = Array.from({ length: cells / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7));
  return { year, month, weeks };
}
