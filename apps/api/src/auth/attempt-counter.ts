/**
 * Counts attempts per key in a sliding window; a key is blocked for `windowMs` once it reaches `limit`.
 * ponytail: in memory, so only correct for one API instance (like the /luyen-tap limits); move to a shared store when scaling out.
 */
export class AttemptCounter {
  private readonly attempts = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxTracked: number,
  ) {}

  get size(): number {
    return this.attempts.size;
  }

  isBlocked(key: string): boolean {
    const entry = this.attempts.get(key);
    if (entry && Date.now() - entry.since >= this.windowMs) {
      this.attempts.delete(key);
      return false;
    }
    return entry !== undefined && entry.count >= this.limit;
  }

  record(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (entry) {
      entry.count += 1;
      // The block lasts windowMs from the attempt that triggered it.
      if (entry.count >= this.limit) {
        entry.since = now;
      }
      return;
    }

    if (this.attempts.size >= this.maxTracked) {
      for (const [trackedKey, tracked] of this.attempts) {
        if (now - tracked.since >= this.windowMs) this.attempts.delete(trackedKey);
      }
      // Still full of fresh entries (a flood of keys): drop the oldest. Maps iterate in insertion order.
      for (const trackedKey of this.attempts.keys()) {
        if (this.attempts.size < this.maxTracked) break;
        this.attempts.delete(trackedKey);
      }
    }
    this.attempts.set(key, { count: 1, since: now });
  }

  /** Takes back one attempt, for example one that turned out to be a successful login. */
  forgive(key: string): void {
    const entry = this.attempts.get(key);
    if (entry && entry.count > 0) {
      entry.count -= 1;
    }
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
