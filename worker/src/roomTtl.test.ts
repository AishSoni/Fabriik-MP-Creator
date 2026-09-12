import { describe, expect, it } from 'vitest';
import { ROOM_TTL_MS, shouldPruneRoom } from './roomTtl';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('shouldPruneRoom', () => {
  it('expires rooms after 30 days of inactivity', () => {
    expect(ROOM_TTL_MS).toBe(30 * DAY_MS);
  });

  it('keeps rooms that were active within the TTL', () => {
    const now = 1_000 * DAY_MS;
    expect(shouldPruneRoom({ lastActiveAt: now - 1, now, connectionCount: 0 })).toBe(false);
    expect(
      shouldPruneRoom({ lastActiveAt: now - ROOM_TTL_MS + 1, now, connectionCount: 0 }),
    ).toBe(false);
  });

  it('expires rooms at or beyond the TTL once empty', () => {
    const now = 1_000 * DAY_MS;
    expect(shouldPruneRoom({ lastActiveAt: now - ROOM_TTL_MS, now, connectionCount: 0 })).toBe(true);
    expect(
      shouldPruneRoom({ lastActiveAt: now - ROOM_TTL_MS - 1, now, connectionCount: 0 }),
    ).toBe(true);
  });

  it('never prunes rooms with open connections', () => {
    const now = 1_000 * DAY_MS;
    expect(shouldPruneRoom({ lastActiveAt: now - 10 * ROOM_TTL_MS, now, connectionCount: 1 })).toBe(
      false,
    );
  });

  it('never prunes rooms with no activity marker (legacy safety)', () => {
    const now = 1_000 * DAY_MS;
    expect(shouldPruneRoom({ lastActiveAt: null, now, connectionCount: 0 })).toBe(false);
    expect(shouldPruneRoom({ lastActiveAt: undefined, now, connectionCount: 0 })).toBe(false);
    expect(shouldPruneRoom({ lastActiveAt: Number.NaN, now, connectionCount: 0 })).toBe(false);
  });

  it('treats a future marker as fresh (clock skew safety)', () => {
    const now = 1_000 * DAY_MS;
    expect(shouldPruneRoom({ lastActiveAt: now + DAY_MS, now, connectionCount: 0 })).toBe(false);
  });

  it('honours a custom TTL', () => {
    const now = 1_000;
    expect(shouldPruneRoom({ lastActiveAt: 0, now, connectionCount: 0, ttlMs: 1_000 })).toBe(true);
    expect(shouldPruneRoom({ lastActiveAt: 1, now, connectionCount: 0, ttlMs: 1_000 })).toBe(false);
  });
});
