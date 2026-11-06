import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttemptCounter } from './attempt-counter.js';

const WINDOW = 1_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('AttemptCounter', () => {
  it('blocks a key after the limit until the window passes', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const counter = new AttemptCounter(3, WINDOW, 100);
    for (let i = 0; i < 3; i++) {
      expect(counter.isBlocked('a')).toBe(false);
      counter.record('a');
    }
    expect(counter.isBlocked('a')).toBe(true);
    expect(counter.isBlocked('b')).toBe(false);

    vi.advanceTimersByTime(WINDOW - 1);
    expect(counter.isBlocked('a')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(counter.isBlocked('a')).toBe(false);
  });

  it('clear forgets a key; forgive takes back one attempt', () => {
    const counter = new AttemptCounter(2, WINDOW, 100);
    counter.record('a');
    counter.record('a');
    counter.forgive('a');
    expect(counter.isBlocked('a')).toBe(false);
    counter.record('a');
    expect(counter.isBlocked('a')).toBe(true);
    counter.clear('a');
    expect(counter.isBlocked('a')).toBe(false);
  });

  it('stays within maxTracked, dropping expired keys first, then the oldest', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const counter = new AttemptCounter(1, WINDOW, 3);
    counter.record('expired');
    vi.advanceTimersByTime(WINDOW);
    for (const key of ['old', 'mid', 'new']) {
      counter.record(key);
    }
    expect(counter.size).toBe(3);
    expect(counter.isBlocked('old')).toBe(true);

    counter.record('newest');
    expect(counter.size).toBe(3);
    expect(counter.isBlocked('old')).toBe(false);
    expect(counter.isBlocked('newest')).toBe(true);
  });
});
