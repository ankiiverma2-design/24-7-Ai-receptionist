/**
 * In-memory token-bucket rate limiter (per key, typically org or IP).
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();
  private capacity: number;
  private refillPerSec: number;

  constructor(capacity: number, refillPerSec: number) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
  }

  allow(key: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.updatedAt = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

export function createOrgRateLimiter(perMinute: number): RateLimiter {
  return new RateLimiter(perMinute, perMinute / 60);
}
