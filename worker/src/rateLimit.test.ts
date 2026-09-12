import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMAND_BURST,
  DEFAULT_COMMAND_REFILL_PER_SECOND,
  createCommandRateLimiter,
  createRateLimiter,
} from './rateLimit';

function makeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows a burst up to capacity before denying', () => {
    const clock = makeClock();
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: clock.now });

    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(false);
    expect(limiter.allow('conn-a')).toBe(false);
  });

  it('refills tokens at the configured rate', () => {
    const clock = makeClock();
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 2, now: clock.now });

    limiter.allow('conn-a');
    limiter.allow('conn-a');
    limiter.allow('conn-a');
    expect(limiter.allow('conn-a')).toBe(false);

    clock.advance(1000);
    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(false);

    clock.advance(500);
    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(false);
  });

  it('never refills past capacity', () => {
    const clock = makeClock();
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: clock.now });

    limiter.allow('conn-a');
    limiter.allow('conn-a');
    clock.advance(60_000);

    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(false);
  });

  it('tracks buckets independently per key', () => {
    const clock = makeClock();
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now });

    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(false);
    expect(limiter.allow('conn-b')).toBe(true);
  });

  it('forget clears a bucket so the key starts fresh', () => {
    const clock = makeClock();
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now });

    expect(limiter.allow('conn-a')).toBe(true);
    expect(limiter.allow('conn-a')).toBe(false);

    limiter.forget('conn-a');

    expect(limiter.allow('conn-a')).toBe(true);
  });
});

describe('createCommandRateLimiter', () => {
  it('applies the default command budget per connection', () => {
    const clock = makeClock();
    const limiter = createCommandRateLimiter(clock.now);

    for (let i = 0; i < DEFAULT_COMMAND_BURST; i += 1) {
      expect(limiter.allow('conn-a')).toBe(true);
    }
    expect(limiter.allow('conn-a')).toBe(false);
    expect(limiter.allow('conn-b')).toBe(true);
    expect(DEFAULT_COMMAND_REFILL_PER_SECOND).toBeGreaterThan(0);
  });
});
