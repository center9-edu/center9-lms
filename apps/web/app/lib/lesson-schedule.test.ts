// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lessonOpenDay } from './lesson-schedule.ts';

// Lesson A: part 1 on Tuesday 01/12 at 18:00 in Vietnam, part 2 on 03/12. Lesson B: one part, at 06:00 on 10/12
// (still 09/12 in UTC). The cancelled session teaches nothing.
const SESSIONS = [
  { startsAt: '2026-12-01T11:00:00.000Z', lesson: { id: 'A', partNumber: 1 } },
  { startsAt: '2026-12-03T11:00:00.000Z', lesson: { id: 'A', partNumber: 2 } },
  { startsAt: '2026-12-08T11:00:00.000Z', lesson: null },
  { startsAt: '2026-12-09T23:00:00.000Z', lesson: { id: 'B', partNumber: 1 } },
];

describe('lessonOpenDay', () => {
  it('is the Vietnam day of the session that teaches the lesson’s first part', () => {
    assert.equal(lessonOpenDay(SESSIONS, 'A'), '01/12/2026');
  });

  it('uses the day in Vietnam, not in UTC', () => {
    assert.equal(lessonOpenDay(SESSIONS, 'B'), '10/12/2026');
  });

  it('is null while no session teaches the first part yet', () => {
    assert.equal(lessonOpenDay(SESSIONS, 'C'), null);
    assert.equal(lessonOpenDay([{ startsAt: '2026-12-03T11:00:00.000Z', lesson: { id: 'A', partNumber: 2 } }], 'A'), null);
  });
});
