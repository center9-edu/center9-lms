// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatSessionTime, vietnamDateTime, WEEKDAYS } from './vietnam-time.ts';

describe('vietnamDateTime', () => {
  it('gives the day and time in Vietnam, for the inputs of a form', () => {
    assert.deepEqual(vietnamDateTime('2026-12-01T11:00:00.000Z'), { date: '2026-12-01', time: '18:00' });
  });

  it('moves to the next day when UTC is still on the day before', () => {
    assert.deepEqual(vietnamDateTime('2026-12-01T23:30:00.000Z'), { date: '2026-12-02', time: '06:30' });
  });
});

describe('formatSessionTime', () => {
  it('names the weekday as Vietnamese do: Thứ 2 is Monday', () => {
    assert.equal(formatSessionTime('2026-12-01T11:00:00.000Z', '2026-12-01T12:30:00.000Z'), 'Thứ 3, 01/12/2026 · 18:00–19:30');
  });

  it('uses the Vietnam day for the weekday, and Chủ nhật for Sunday', () => {
    assert.equal(formatSessionTime('2026-12-01T23:30:00.000Z', '2026-12-02T01:00:00.000Z'), 'Thứ 4, 02/12/2026 · 06:30–08:00');
    assert.equal(formatSessionTime('2026-11-29T01:00:00.000Z', '2026-11-29T02:30:00.000Z'), 'Chủ nhật, 29/11/2026 · 08:00–09:30');
  });
});

describe('WEEKDAYS', () => {
  it('lists the ISO numbers the API takes, Monday first', () => {
    assert.deepEqual(
      WEEKDAYS.map(({ value }) => value),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(WEEKDAYS[0]?.label, 'Thứ 2');
    assert.equal(WEEKDAYS[6]?.label, 'Chủ nhật');
  });
});
