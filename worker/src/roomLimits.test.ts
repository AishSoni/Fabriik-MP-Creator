import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ROOM_CONNECTIONS,
  MAX_MAX_ROOM_CONNECTIONS,
  MIN_MAX_ROOM_CONNECTIONS,
  isRoomFull,
  parseMaxRoomConnections,
} from './roomLimits';

describe('parseMaxRoomConnections', () => {
  it('defaults when the value is missing or blank', () => {
    expect(parseMaxRoomConnections(undefined)).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('')).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('   ')).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
  });

  it('accepts a positive integer string and trims whitespace', () => {
    expect(parseMaxRoomConnections('24')).toBe(24);
    expect(parseMaxRoomConnections(' 24 ')).toBe(24);
  });

  it('falls back on non-numeric or fractional values', () => {
    expect(parseMaxRoomConnections('abc')).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('3.5')).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('Infinity')).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('NaN')).toBe(DEFAULT_MAX_ROOM_CONNECTIONS);
  });

  it('clamps out-of-range values', () => {
    expect(parseMaxRoomConnections('0')).toBe(MIN_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('-8')).toBe(MIN_MAX_ROOM_CONNECTIONS);
    expect(parseMaxRoomConnections('10000')).toBe(MAX_MAX_ROOM_CONNECTIONS);
  });

  it('honours a custom fallback', () => {
    expect(parseMaxRoomConnections(undefined, 4)).toBe(4);
    expect(parseMaxRoomConnections('nope', 4)).toBe(4);
  });
});

describe('isRoomFull', () => {
  it('allows connections up to the cap', () => {
    expect(isRoomFull(1, 16)).toBe(false);
    expect(isRoomFull(16, 16)).toBe(false);
  });

  it('reports full once the count exceeds the cap', () => {
    expect(isRoomFull(17, 16)).toBe(true);
  });
});
