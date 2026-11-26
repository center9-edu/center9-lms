import { vietnamDateTime } from './vietnam-time.ts';

/**
 * "dd/mm/yyyy": the day (in Vietnam) a lesson opens to learners, which is the day of the session that teaches
 * its first part (the API's rule); null while no session teaches it yet.
 */
export function lessonOpenDay(sessions: { startsAt: string; lesson: { id: string; partNumber: number } | null }[], lessonId: string): string | null {
  const first = sessions.find(({ lesson }) => lesson?.id === lessonId && lesson.partNumber === 1);
  if (!first) {
    return null;
  }
  const [year, month, day] = vietnamDateTime(first.startsAt).date.split('-');
  return `${day}/${month}/${year}`;
}
