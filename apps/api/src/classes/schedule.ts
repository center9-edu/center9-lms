// Pure scheduling rules for a class (agreed 2026-11-26): every part of every lesson is one session, in
// curriculum order, and a lesson opens to students from the day of the session that teaches its first part.
// Nothing here is stored: the curriculum can change at any time, so the mapping is worked out on each read.

/** Every class takes place in Vietnam (Asia/Ho_Chi_Minh), always UTC+7: there is no daylight saving time there. */
const UTC_OFFSET = '+07:00';
const UTC_OFFSET_MS = 7 * 3_600_000;

/** The moment `time` ("HH:MM") on `date` ("YYYY-MM-DD") in Vietnam. */
export function vietnamTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${UTC_OFFSET}`);
}

export interface Part {
  lessonId: string;
  /** 1-based. */
  partNumber: number;
  partCount: number;
}

/** Each lesson's parts in order; `chapters` and their `lessons` come in position order. */
export function curriculumParts(chapters: { lessons: { id: string; partCount: number }[] }[]): Part[] {
  return chapters.flatMap(({ lessons }) =>
    lessons.flatMap(({ id, partCount }) => Array.from({ length: partCount }, (_, index) => ({ lessonId: id, partNumber: index + 1, partCount }))),
  );
}

/**
 * Sorts sessions by start time. A completed session keeps the part recorded when it was settled (`taught`), so
 * history never changes: one settled with nothing to teach (say, a review after the last part) stays empty even
 * if lessons are added later. The parts not taught yet go, in curriculum order, to the sessions still to come
 * that are not cancelled. `missing` is how many parts no session teaches yet.
 */
export function planSessions<S extends { startsAt: Date; status: string; taught?: { lessonId: string; partNumber: number }[] }>(
  sessions: S[],
  parts: Part[],
): { sessions: (S & { part: Part | null })[]; missing: number } {
  const key = ({ lessonId, partNumber }: { lessonId: string; partNumber: number }) => `${lessonId}:${partNumber}`;
  const taught = new Set(sessions.flatMap((session) => (session.status === 'COMPLETED' ? (session.taught ?? []).map(key) : [])));
  const partCounts = new Map(parts.map(({ lessonId, partCount }) => [lessonId, partCount]));
  const remaining = parts.filter((part) => !taught.has(key(part)));
  let next = 0;
  const planned = [...sessions]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((session) => {
      const recorded = session.taught?.[0];
      // A taught lesson stays in the curriculum (the curriculum guards refuse to delete it), so its count is known.
      const part: Part | null =
        session.status === 'COMPLETED'
          ? recorded
            ? { ...recorded, partCount: partCounts.get(recorded.lessonId) ?? recorded.partNumber }
            : null
          : session.status === 'CANCELLED'
            ? null
            : (remaining[next++] ?? null);
      return { ...session, part };
    });
  return { sessions: planned, missing: Math.max(0, remaining.length - next) };
}

/**
 * "YYYY-MM-DD" of the moment in Vietnam. Plain arithmetic rather than toLocaleDateString: the result is compared
 * as text to decide what unlocks, so it must not depend on the runtime's locale data.
 */
export function vietnamDay(moment: Date): string {
  return new Date(moment.getTime() + UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** True from midnight (Vietnam time) of the day the session takes place, so students can read ahead of class. */
export function isUnlocked(startsAt: Date, now: Date): boolean {
  return vietnamDay(startsAt) <= vietnamDay(now);
}

/** Lessons whose first part sits on a session that has reached its day; a cancelled session holds no part. */
export function unlockedLessons(planned: { startsAt: Date; part: Part | null }[], now: Date): Set<string> {
  return new Set(planned.flatMap(({ part, startsAt }) => (part?.partNumber === 1 && isUnlocked(startsAt, now) ? [part.lessonId] : [])));
}

/**
 * `count` sessions on the given weekdays from `startDate` on (that day included), at the given times in Vietnam.
 * Weekdays are ISO numbers as Vietnamese names them: 1 = Monday ("Thứ 2") … 6 = Saturday, 7 = Sunday ("Chủ nhật").
 */
export function weeklySessions({
  startDate,
  weekdays,
  startTime,
  endTime,
  count,
}: {
  startDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  count: number;
}): { startsAt: Date; endsAt: Date }[] {
  // Only real weekdays and a real start date: without them, the loop below would look for a matching day forever.
  const days = new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7));
  // Calendar days as UTC midnights, so stepping by 24 hours never crosses a time change.
  const first = new Date(`${startDate}T00:00:00Z`);
  const sessions: { startsAt: Date; endsAt: Date }[] = [];
  if (days.size === 0 || Number.isNaN(first.getTime())) {
    return sessions;
  }
  for (let day = first; sessions.length < count; day = new Date(day.getTime() + 86_400_000)) {
    const isoWeekday = ((day.getUTCDay() + 6) % 7) + 1;
    if (days.has(isoWeekday)) {
      const date = day.toISOString().slice(0, 10);
      sessions.push({ startsAt: vietnamTime(date, startTime), endsAt: vietnamTime(date, endTime) });
    }
  }
  return sessions;
}

/**
 * Where a session added at the end goes (a day off pushes the schedule back): the first class day of the weekly
 * pattern after the last session's day. A class scheduled before patterns were kept gets the same times one week later.
 */
export function nextWeeklySlot(
  pattern: { weekdays: number[]; startTime: string | null; endTime: string | null },
  last: { startsAt: Date; endsAt: Date },
): { startsAt: Date; endsAt: Date } {
  const dayAfter = new Date(new Date(`${vietnamDay(last.startsAt)}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const [slot] =
    pattern.startTime && pattern.endTime ? weeklySessions({ startDate: dayAfter, weekdays: pattern.weekdays, startTime: pattern.startTime, endTime: pattern.endTime, count: 1 }) : [];
  const WEEK = 7 * 86_400_000;
  return slot ?? { startsAt: new Date(last.startsAt.getTime() + WEEK), endsAt: new Date(last.endsAt.getTime() + WEEK) };
}
