// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { monthGrid } from './calendar.ts';

const days = (week: { day: number }[]) => week.map(({ day }) => day);

describe('monthGrid', () => {
  it('starts weeks on Monday, padding with the previous and next month', () => {
    // 1 February 2026 is a Sunday: the first row is 26–31 January plus 1 February.
    const grid = monthGrid(new Date('2026-02-10T09:00:00+07:00'));
    assert.equal(grid.year, 2026);
    assert.equal(grid.month, 2);
    assert.deepEqual(days(grid.weeks[0]!), [26, 27, 28, 29, 30, 31, 1]);
    assert.deepEqual(
      grid.weeks[0]!.map(({ inMonth }) => inMonth),
      [false, false, false, false, false, false, true],
    );
    assert.equal(grid.weeks.length, 5);
    assert.ok(grid.weeks.every((week) => week.length === 7));
  });

  it('has 29 days in February of a leap year', () => {
    const grid = monthGrid(new Date('2028-02-01T09:00:00+07:00'));
    const inMonth = grid.weeks.flat().filter((cell) => cell.inMonth);
    assert.equal(inMonth.length, 29);
    assert.equal(inMonth.at(-1)!.date, '2028-02-29');
  });

  it('uses the Vietnam date for today and for marked days', () => {
    // 20:00 UTC on 30 November is already 03:00 on 1 December in Vietnam.
    const now = new Date('2026-11-30T20:00:00Z');
    const grid = monthGrid(now, [new Date('2026-12-02T17:30:00Z'), new Date('2026-11-30T10:00:00+07:00')]);
    assert.equal(grid.month, 12);
    const cells = grid.weeks.flat();
    assert.deepEqual(
      cells.filter(({ today }) => today).map(({ date }) => date),
      ['2026-12-01'],
    );
    // 17:30 UTC on 2 December is 00:30 on 3 December in Vietnam; 30 November shows as padding and stays marked.
    assert.deepEqual(
      cells.filter(({ marked }) => marked).map(({ date }) => date),
      ['2026-11-30', '2026-12-03'],
    );
  });
});
