// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { colorIndex, givenName, initialOf } from './names.ts';

describe('initialOf', () => {
  it('takes the given name, which comes last in Vietnamese', () => {
    assert.equal(initialOf('Trần Thị Lan'), 'L');
    assert.equal(initialOf('  Phạm   Văn  Nam '), 'N');
  });

  it('keeps the accent of a decomposed name and upper-cases Vietnamese letters', () => {
    assert.equal(initialOf('Nguyễn Thị Ánh'), 'Á');
    assert.equal(initialOf('lê đức'), 'Đ');
  });

  it('falls back for an empty name', () => {
    assert.equal(initialOf('   '), '?');
  });
});

describe('colorIndex', () => {
  it('is stable and within range', () => {
    assert.equal(colorIndex('Trần Thị Lan', 6), colorIndex('Trần Thị Lan', 6));
    for (const name of ['a', 'Lê Bảo An', 'Quản trị viên', '']) {
      const index = colorIndex(name, 6);
      assert.ok(index >= 0 && index < 6, name);
    }
  });
});

describe('givenName', () => {
  it('is the last word of the full name', () => {
    assert.equal(givenName(' Nguyễn  Văn Hùng '), 'Hùng');
    assert.equal(givenName(''), '');
  });
});
