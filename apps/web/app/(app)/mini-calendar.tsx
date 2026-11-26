import { monthGrid } from '../lib/calendar';

const WEEKDAYS = [
  ['T2', 'Thứ Hai'],
  ['T3', 'Thứ Ba'],
  ['T4', 'Thứ Tư'],
  ['T5', 'Thứ Năm'],
  ['T6', 'Thứ Sáu'],
  ['T7', 'Thứ Bảy'],
  ['CN', 'Chủ Nhật'],
];

/** This month in Vietnam time; days in `marked` (sessions) are highlighted and described by `markedLabel` ("Có buổi học"). A table, so screen readers can move by row and column. */
export function MiniCalendar({ now, marked, markedLabel }: { now: Date; marked: Date[]; markedLabel: string }) {
  const { year, month, weeks } = monthGrid(now, marked);
  return (
    <div className="grid gap-3">
      <table className="w-full table-fixed border-collapse text-center text-sm">
        <caption className="mb-2 text-left font-semibold">
          Tháng {month}, {year}
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => (
              <th key={short} scope="col" abbr={long} className="pb-1 text-xs font-medium text-muted">
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.date}>
              {week.map(({ date, day, inMonth, today, marked: isMarked }) => (
                <td key={date} className="p-0.5">
                  <span
                    aria-current={today ? 'date' : undefined}
                    className={`mx-auto grid size-8 place-items-center rounded-lg ${
                      today
                        ? 'bg-primary font-semibold text-white'
                        : isMarked
                          ? 'bg-primary-50 font-semibold text-primary'
                          : inMonth
                            ? 'text-foreground'
                            : 'text-muted/60'
                    }`}
                  >
                    {day}
                    {isMarked && <span className="sr-only">, {markedLabel.toLowerCase()}</span>}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded bg-primary" /> Hôm nay
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded bg-primary-50 ring-1 ring-primary/30" /> {markedLabel}
        </span>
      </p>
    </div>
  );
}
