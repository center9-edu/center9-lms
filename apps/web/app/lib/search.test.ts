// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesSearch } from './search.ts';

describe('matchesSearch', () => {
  it('ignores case, Vietnamese accents and đ', () => {
    assert.equal(matchesSearch(['Lập trình Python cơ bản'], 'lap trinh'), true);
    assert.equal(matchesSearch(['Đồ hoạ Scratch'], 'do hoa'), true);
    assert.equal(matchesSearch(['Python'], 'PYTHON'), true);
  });

  it('matches typed accents too, also when composed differently', () => {
    assert.equal(matchesSearch(['Lập trình Python'], 'lập'), true);
    assert.equal(matchesSearch(['Lập trình Python'], 'lập'), true);
  });

  it('needs every word, in any field and any order', () => {
    assert.equal(matchesSearch(['Python', 'Cho học sinh lớp 6'], 'lop 6 python'), true);
    assert.equal(matchesSearch(['Python', 'Cho học sinh lớp 6'], 'python scratch'), false);
  });

  it('matches everything for a blank query and skips empty fields', () => {
    assert.equal(matchesSearch(['Python', null], '   '), true);
    assert.equal(matchesSearch([null], 'python'), false);
  });
});
