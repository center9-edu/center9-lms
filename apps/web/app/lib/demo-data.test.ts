// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attendanceOf, classesFor, classesOf, demoClasses, upcomingSessions, vnDate } from './demo-data.ts';
import type { Role, SessionUser } from './session';

// Monday 09/11/2026, 10:00 in Vietnam.
const MORNING = new Date('2026-11-09T10:00:00+07:00');
const TWO_HOURS = 2 * 60 * 60 * 1000;

const user = (username: string, roles: Role[]): SessionUser => ({ id: username, username, fullName: username, roles, mustChangePassword: false });
const codes = (classes: { code: string }[]) => classes.map((demoClass) => demoClass.code);

describe('demoClasses', () => {
  it('marks sessions that ended as completed, with attendance for every student', () => {
    for (const demoClass of demoClasses(MORNING)) {
      for (const session of demoClass.sessions) {
        const done = session.startsAt.getTime() < MORNING.getTime() - TWO_HOURS;
        assert.equal(session.status, done ? 'COMPLETED' : 'SCHEDULED', session.id);
        assert.deepEqual(Object.keys(session.attendance).sort(), done ? demoClass.students.map((s) => s.username).sort() : [], session.id);
      }
    }
  });

  it('follows the date it is called with, not the date the server started', () => {
    const todaysSession = (now: Date) => demoClasses(now)[0].sessions[5];
    assert.equal(todaysSession(MORNING).startsAt.toISOString(), new Date('2026-11-09T18:00:00+07:00').toISOString());
    assert.equal(todaysSession(MORNING).status, 'SCHEDULED');
    assert.equal(todaysSession(new Date('2026-11-09T21:00:00+07:00')).status, 'COMPLETED');
    assert.equal(vnDate(todaysSession(new Date('2026-11-10T10:00:00+07:00')).startsAt), '2026-11-10');
  });
});

describe('classesFor', () => {
  it('shows every class to admins and sales', () => {
    assert.equal(classesFor(user('admin', ['SUPER_ADMIN']), MORNING).length, 4);
    assert.equal(classesFor(user('nv.ha', ['SALES']), MORNING).length, 4);
    assert.equal(classesFor(user('gv.nam', ['TEACHER', 'SALES']), MORNING).length, 4);
  });

  it('shows a teacher only the classes they teach', () => {
    assert.deepEqual(codes(classesFor(user('gv.lan', ['TEACHER']), MORNING)), ['PY-K12-01', 'PY-K12-03', 'WEB-K14-01']);
    assert.deepEqual(classesFor(user('gv.moi', ['TEACHER']), MORNING), []);
  });
});

describe('attendanceOf', () => {
  it('counts present and late over the sessions that have attendance', () => {
    // hs.an: 5 held sessions in PY-K12-01 (late, present, excused, present, absent) and 3 in SCR-K08-02 (all present).
    assert.deepEqual(attendanceOf('hs.an', MORNING), { attended: 6, total: 8 });
    assert.deepEqual(attendanceOf('nobody', MORNING), { attended: 0, total: 0 });
  });
});

describe('upcomingSessions', () => {
  it('lists scheduled sessions from the start of today, soonest first, up to the limit', () => {
    const items = upcomingSessions(classesOf('hs.minh', MORNING), 3, MORNING);
    assert.equal(items.length, 3);
    assert.equal(items[0].session.id, 'PY-K12-01-6');
    for (const [index, { session }] of items.entries()) {
      assert.equal(session.status, 'SCHEDULED');
      assert.ok(session.startsAt >= new Date('2026-11-09T00:00:00+07:00'));
      if (index > 0) assert.ok(session.startsAt >= items[index - 1].session.startsAt);
    }
  });
});
