// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { greeting } from './greeting.ts';

const at = (time: string) => new Date(`2026-11-17T${time}+07:00`);

describe('greeting', () => {
  it('follows the time of day in Vietnam and calls people by their given name', () => {
    assert.equal(greeting('Trần Thị Lan', at('07:30:00')), 'Chào buổi sáng, Lan');
    assert.equal(greeting('Trần Thị Lan', at('11:59:59')), 'Chào buổi sáng, Lan');
    assert.equal(greeting('Trần Thị Lan', at('12:00:00')), 'Chào buổi chiều, Lan');
    assert.equal(greeting('Trần Thị Lan', at('18:00:00')), 'Chào buổi tối, Lan');
    assert.equal(greeting('Trần Thị Lan', at('03:00:00')), 'Chào buổi tối, Lan');
  });

  it('uses Vietnam time whatever the server time zone', () => {
    // 23:30 UTC is 06:30 the next morning in Vietnam.
    assert.equal(greeting('Lê Bảo An', new Date('2026-11-16T23:30:00Z')), 'Chào buổi sáng, An');
  });

  it('greets without a name when there is none', () => {
    assert.equal(greeting('  ', at('09:00:00')), 'Chào buổi sáng');
  });
});
