import { givenName } from './names.ts';

const hourInVietnam = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' });

/** "Chào buổi sáng, Lan": morning until noon, afternoon until 18:00, evening otherwise (Vietnam time). */
export function greeting(fullName: string, now = new Date()): string {
  const hour = Number(hourInVietnam.format(now));
  const partOfDay = hour >= 4 && hour < 12 ? 'sáng' : hour >= 12 && hour < 18 ? 'chiều' : 'tối';
  const name = givenName(fullName);
  return name ? `Chào buổi ${partOfDay}, ${name}` : `Chào buổi ${partOfDay}`;
}
