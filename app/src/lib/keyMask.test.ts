import { describe, expect, it } from 'vitest';
import { maskKey } from './keyMask';

describe('maskKey (spec ai-byok §9 masked display)', () => {
  it('shows the prefix and last four characters for typical keys', () => {
    expect(maskKey('sk-proj-abcdefgh1234a1b2')).toBe('sk-…a1b2');
    expect(maskKey('AIzaSyABCDEF1234567890')).toBe('AIz…7890');
  });

  it('fully masks short keys without revealing any character', () => {
    expect(maskKey('abc')).toBe('•••');
    expect(maskKey('1234567')).toBe('•••••••');
  });

  it('returns null for missing or empty keys', () => {
    expect(maskKey(undefined)).toBeNull();
    expect(maskKey(null)).toBeNull();
    expect(maskKey('')).toBeNull();
  });
});
