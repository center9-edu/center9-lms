// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attendanceBody } from './attendance-form.ts';

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) {
    data.append(name, value);
  }
  return data;
};

describe('attendanceBody', () => {
  it('sends a mark for every student whose status was chosen, with a trimmed note', () => {
    const body = attendanceBody(
      form([
        ['enrollmentId', 'e1'],
        ['enrollmentId', 'e2'],
        ['status-e1', 'PRESENT'],
        ['note-e1', '  '],
        ['status-e2', 'LATE'],
        ['note-e2', ' Đến muộn 10 phút '],
      ]),
    );
    assert.deepEqual(body, {
      records: [
        { enrollmentId: 'e1', status: 'PRESENT', note: null },
        { enrollmentId: 'e2', status: 'LATE', note: 'Đến muộn 10 phút' },
      ],
    });
  });

  it('leaves out a student nobody marked yet', () => {
    const body = attendanceBody(
      form([
        ['enrollmentId', 'e1'],
        ['enrollmentId', 'e2'],
        ['status-e2', 'ABSENT'],
      ]),
    );
    assert.deepEqual(
      body.records.map(({ enrollmentId }) => enrollmentId),
      ['e2'],
    );
  });

  it('sends who taught only when one is chosen', () => {
    assert.equal(attendanceBody(form([['taughtBy', '']])).taughtBy, undefined);
    assert.equal(attendanceBody(form([['taughtBy', 'gv-nam']])).taughtBy, 'gv-nam');
  });
});
