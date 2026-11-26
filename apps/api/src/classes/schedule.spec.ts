import { afterEach, describe, expect, it, vi } from 'vitest';
import { curriculumParts, isUnlocked, nextWeeklySlot, planSessions, unlockedLessons, weeklySessions } from './schedule.js';

// Two chapters: A (2 parts) and B (1 part) in chapter 1, C (2 parts) in chapter 2 → 5 parts, 5 sessions.
const CHAPTERS = [{ lessons: [{ id: 'A', partCount: 2 }, { id: 'B', partCount: 1 }] }, { lessons: [] }, { lessons: [{ id: 'C', partCount: 2 }] }];

const vn = (local: string) => new Date(`${local}+07:00`);
const session = (id: string, startsAt: string, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' = 'SCHEDULED') => ({ id, startsAt: vn(startsAt), status });
const label = (part: { lessonId: string; partNumber: number } | null) => (part ? `${part.lessonId}${part.partNumber}` : '-');

describe('curriculumParts', () => {
  it('lists every part in chapter, lesson, part order', () => {
    expect(curriculumParts(CHAPTERS).map(label)).toEqual(['A1', 'A2', 'B1', 'C1', 'C2']);
    expect(curriculumParts(CHAPTERS)[1]).toEqual({ lessonId: 'A', partNumber: 2, partCount: 2 });
  });

  it('is empty for an empty curriculum', () => {
    expect(curriculumParts([])).toEqual([]);
  });
});

describe('planSessions', () => {
  const parts = curriculumParts(CHAPTERS);

  it('gives the k-th session (by start time) the k-th part, whatever order the sessions come in', () => {
    const sessions = [session('s3', '2026-12-08T18:00'), session('s1', '2026-12-01T18:00'), session('s2', '2026-12-03T18:00')];
    const plan = planSessions(sessions, parts);
    expect(plan.sessions.map((s) => `${s.id}:${label(s.part)}`)).toEqual(['s1:A1', 's2:A2', 's3:B1']);
    expect(plan.missing).toBe(2);
  });

  it('skips a cancelled session: its part moves to the next session', () => {
    const sessions = [
      session('s1', '2026-12-01T18:00'),
      session('s2', '2026-12-03T18:00', 'CANCELLED'),
      session('s3', '2026-12-08T18:00'),
      // A settled session keeps the part it recorded.
      { ...session('s4', '2026-12-10T18:00', 'COMPLETED'), taught: [{ lessonId: 'B', partNumber: 1 }] },
      session('s5', '2026-12-15T18:00'),
      session('s6', '2026-12-17T18:00'),
    ];
    const plan = planSessions(sessions, parts);
    expect(plan.sessions.map((s) => `${s.id}:${label(s.part)}`)).toEqual(['s1:A1', 's2:-', 's3:A2', 's4:B1', 's5:C1', 's6:C2']);
    expect(plan.missing).toBe(0);
  });

  it('leaves extra sessions without a part and never reports a negative shortfall', () => {
    const sessions = [0, 1, 2, 3, 4, 5].map((n) => session(`s${n}`, `2026-12-0${n + 1}T18:00`));
    const plan = planSessions(sessions, parts);
    expect(plan.sessions.at(-1)?.part).toBeNull();
    expect(plan.missing).toBe(0);
  });
});

describe('planSessions with taught sessions', () => {
  const parts = curriculumParts(CHAPTERS);
  // A completed session keeps the part recorded when it was settled.
  const taught = (id: string, day: string, lessonId: string, partNumber: number) => ({ ...session(id, `${day}T18:00`, 'COMPLETED'), taught: [{ lessonId, partNumber }] });

  it('keeps what completed sessions taught and gives the parts not taught yet to the coming sessions', () => {
    const sessions = [taught('s1', '2026-12-01', 'A', 1), taught('s2', '2026-12-03', 'A', 2), session('s3', '2026-12-08T18:00'), session('s4', '2026-12-10T18:00')];
    const plan = planSessions(sessions, parts);
    expect(plan.sessions.map((s) => `${s.id}:${label(s.part)}`)).toEqual(['s1:A1', 's2:A2', 's3:B1', 's4:C1']);
    expect(plan.missing).toBe(1);
  });

  it('does not rewrite history when a lesson is added before what was taught', () => {
    // Lesson N was added at the start of the curriculum after A1 and A2 were taught.
    const withNew = curriculumParts([{ lessons: [{ id: 'N', partCount: 1 }] }, ...CHAPTERS]);
    const sessions = [taught('s1', '2026-12-01', 'A', 1), taught('s2', '2026-12-03', 'A', 2), session('s3', '2026-12-08T18:00')];
    expect(planSessions(sessions, withNew).sessions.map((s) => `${s.id}:${label(s.part)}`)).toEqual(['s1:A1', 's2:A2', 's3:N1']);
  });

  it('takes the part count of a taught part from the curriculum', () => {
    const plan = planSessions([taught('s1', '2026-12-01', 'A', 2)], parts);
    expect(plan.sessions[0]?.part).toEqual({ lessonId: 'A', partNumber: 2, partCount: 2 });
  });

  it('keeps a completed session that taught no part empty, even when the curriculum grows later', () => {
    // A review session after the last part was settled with nothing to teach; then lesson N was added at the end.
    const grown = curriculumParts([...CHAPTERS, { lessons: [{ id: 'N', partCount: 1 }] }]);
    const review = { ...session('r', '2026-12-15T18:00', 'COMPLETED'), taught: [] };
    const sessions = [taught('s1', '2026-12-01', 'A', 1), review, session('s9', '2026-12-20T18:00')];
    const plan = planSessions(sessions, grown);
    expect(plan.sessions.map((s) => `${s.id}:${label(s.part)}`)).toEqual(['s1:A1', 'r:-', 's9:A2']);
  });
});

describe('nextWeeklySlot', () => {
  const pattern = { weekdays: [1, 3, 5], startTime: '18:00', endTime: '19:30' };

  it('gives the next class day after the last session, on the weekly pattern, in Vietnam time', () => {
    // After Friday 04/12 comes Monday 07/12.
    expect(nextWeeklySlot(pattern, { startsAt: vn('2026-12-04T18:00'), endsAt: vn('2026-12-04T19:30') })).toEqual({
      startsAt: vn('2026-12-07T18:00'),
      endsAt: vn('2026-12-07T19:30'),
    });
  });

  it('never lands on the same day as the last session, even if it was moved to another time', () => {
    expect(nextWeeklySlot(pattern, { startsAt: vn('2026-12-02T08:00'), endsAt: vn('2026-12-02T09:30') }).startsAt).toEqual(vn('2026-12-04T18:00'));
  });

  it('falls back to one week after the last session, same times, for a class without a pattern', () => {
    const last = { startsAt: vn('2026-12-04T18:00'), endsAt: vn('2026-12-04T19:30') };
    expect(nextWeeklySlot({ weekdays: [], startTime: null, endTime: null }, last)).toEqual({ startsAt: vn('2026-12-11T18:00'), endsAt: vn('2026-12-11T19:30') });
  });
});

describe('isUnlocked', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A session on Tuesday 2026-12-01 at 18:00 in Vietnam (11:00 UTC).
  const startsAt = vn('2026-12-01T18:00');

  it('opens from midnight of the session day in Vietnam, not at the start time', () => {
    expect(isUnlocked(startsAt, new Date('2026-11-30T16:59:59Z'))).toBe(false); // 23:59:59 Monday in Vietnam
    expect(isUnlocked(startsAt, new Date('2026-11-30T17:00:00Z'))).toBe(true); // 00:00 Tuesday in Vietnam
    expect(isUnlocked(startsAt, vn('2026-12-01T07:00'))).toBe(true);
    expect(isUnlocked(startsAt, vn('2027-01-01T00:00'))).toBe(true);
  });

  it('does not depend on how the runtime formats dates: a January lesson stays locked in December', () => {
    // A runtime whose locale data formats en-CA as MM/DD/YYYY would compare "12/31/2026" > "01/05/2027".
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date) {
      const [y, m, d] = this.toISOString().slice(0, 10).split('-');
      return `${m}/${d}/${y}`;
    });
    expect(isUnlocked(vn('2027-01-05T18:00'), vn('2026-12-31T12:00'))).toBe(false);
    expect(isUnlocked(vn('2027-01-05T18:00'), vn('2027-01-05T00:00'))).toBe(true);
  });

  it('uses the day in Vietnam for a session early in the morning, when UTC is still the day before', () => {
    const early = vn('2026-12-02T06:00'); // 2026-12-01T23:00Z
    expect(isUnlocked(early, vn('2026-12-01T23:59'))).toBe(false);
    expect(isUnlocked(early, vn('2026-12-02T00:00'))).toBe(true);
  });
});

describe('unlockedLessons', () => {
  const parts = curriculumParts(CHAPTERS);
  const sessions = [
    session('s1', '2026-12-01T18:00'),
    session('s2', '2026-12-03T18:00'),
    session('s3', '2026-12-08T18:00', 'CANCELLED'),
    session('s4', '2026-12-10T18:00'),
  ];

  it('opens a lesson once the session of its first part has reached its day; later parts do not matter', () => {
    const plan = planSessions(sessions, parts);
    expect([...unlockedLessons(plan.sessions, vn('2026-11-30T12:00'))]).toEqual([]);
    expect([...unlockedLessons(plan.sessions, vn('2026-12-01T00:00'))]).toEqual(['A']);
    // B1 sits on s4 because s3 is cancelled.
    expect([...unlockedLessons(plan.sessions, vn('2026-12-08T20:00'))]).toEqual(['A']);
    expect([...unlockedLessons(plan.sessions, vn('2026-12-10T00:00'))]).toEqual(['A', 'B']);
  });

  it('never opens a lesson whose first part has no session yet', () => {
    const plan = planSessions(sessions, parts);
    expect(unlockedLessons(plan.sessions, vn('2030-01-01T00:00')).has('C')).toBe(false);
  });
});

describe('weeklySessions', () => {
  it('makes sessions on the chosen weekdays (1 = Monday "Thứ 2" … 7 = Sunday) from the start date, in Vietnam time', () => {
    // Starts on Sunday 2026-11-29; Tuesday and Thursday ("Thứ 3", "Thứ 5") from 18:00 to 19:30.
    const sessions = weeklySessions({ startDate: '2026-11-29', weekdays: [2, 4], startTime: '18:00', endTime: '19:30', count: 4 });
    expect(sessions).toEqual([
      { startsAt: vn('2026-12-01T18:00'), endsAt: vn('2026-12-01T19:30') },
      { startsAt: vn('2026-12-03T18:00'), endsAt: vn('2026-12-03T19:30') },
      { startsAt: vn('2026-12-08T18:00'), endsAt: vn('2026-12-08T19:30') },
      { startsAt: vn('2026-12-10T18:00'), endsAt: vn('2026-12-10T19:30') },
    ]);
  });

  it('counts the start date itself when it is one of the weekdays, and handles Sunday (7)', () => {
    const sessions = weeklySessions({ startDate: '2026-11-29', weekdays: [7], startTime: '08:00', endTime: '09:30', count: 2 });
    expect(sessions.map((s) => s.startsAt)).toEqual([vn('2026-11-29T08:00'), vn('2026-12-06T08:00')]);
  });

  it('returns nothing without weekdays or sessions to make', () => {
    expect(weeklySessions({ startDate: '2026-11-29', weekdays: [], startTime: '08:00', endTime: '09:00', count: 5 })).toEqual([]);
    expect(weeklySessions({ startDate: '2026-11-29', weekdays: [1], startTime: '08:00', endTime: '09:00', count: 0 })).toEqual([]);    // Not a weekday at all: must not loop forever looking for one.
    expect(weeklySessions({ startDate: '2026-11-29', weekdays: [0, 8], startTime: '08:00', endTime: '09:00', count: 3 })).toEqual([]);
    expect(weeklySessions({ startDate: 'not-a-date', weekdays: [1], startTime: '08:00', endTime: '09:00', count: 3 })).toEqual([]);
  });
});
