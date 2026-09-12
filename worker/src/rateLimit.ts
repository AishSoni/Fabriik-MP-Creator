export interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}

export interface RateLimiter {
  allow(key: string): boolean;
  forget(key: string): void;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export const DEFAULT_COMMAND_BURST = 100;
export const DEFAULT_COMMAND_REFILL_PER_SECOND = 20;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const capacity = Math.max(1, options.capacity);
  const refillPerSecond = Math.max(0, options.refillPerSecond);
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  return {
    allow(key: string): boolean {
      const timestamp = now();
      const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: timestamp };
      const elapsedSeconds = Math.max(0, timestamp - bucket.updatedAt) / 1000;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
      bucket.updatedAt = timestamp;
      if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return true;
    },
    forget(key: string): void {
      buckets.delete(key);
    },
  };
}

export function createCommandRateLimiter(now: () => number = Date.now): RateLimiter {
  return createRateLimiter({
    capacity: DEFAULT_COMMAND_BURST,
    refillPerSecond: DEFAULT_COMMAND_REFILL_PER_SECOND,
    now,
  });
}
