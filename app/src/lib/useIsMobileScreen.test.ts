import { describe, expect, it, vi, afterEach } from 'vitest';
import { isMobileScreenWidth } from './useIsMobileScreen';

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return mql;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isMobileScreenWidth', () => {
  it('returns true when the media query matches', () => {
    mockMatchMedia(true);
    expect(isMobileScreenWidth()).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    mockMatchMedia(false);
    expect(isMobileScreenWidth()).toBe(false);
  });
});
