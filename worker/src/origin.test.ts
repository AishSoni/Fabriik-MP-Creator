import { describe, expect, it } from 'vitest';

import { isOriginAllowed, parseAllowedOrigins } from './origin';

describe('parseAllowedOrigins', () => {
  it('returns an empty list for missing or blank input', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('   ')).toEqual([]);
  });

  it('normalizes a single origin', () => {
    expect(parseAllowedOrigins('https://aish-s-fabriik-mp.vercel.app/')).toEqual([
      'https://aish-s-fabriik-mp.vercel.app',
    ]);
  });

  it('splits on commas, trims whitespace, and drops empty entries', () => {
    expect(
      parseAllowedOrigins(
        ' https://aish-s-fabriik-mp.vercel.app , http://localhost:5173 ,, http://localhost:4173 ',
      ),
    ).toEqual([
      'https://aish-s-fabriik-mp.vercel.app',
      'http://localhost:5173',
      'http://localhost:4173',
    ]);
  });

  it('lowercases origins and strips repeated trailing slashes', () => {
    expect(parseAllowedOrigins('HTTPS://Example.COM///')).toEqual(['https://example.com']);
  });
});

describe('isOriginAllowed', () => {
  const allowed = parseAllowedOrigins(
    'https://aish-s-fabriik-mp.vercel.app,http://localhost:5173',
  );

  it('allows requests without an Origin header', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed(null, allowed)).toBe(true);
    expect(isOriginAllowed('', allowed)).toBe(true);
  });

  it('allows exact allowlisted origins', () => {
    expect(isOriginAllowed('https://aish-s-fabriik-mp.vercel.app', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
  });

  it('ignores trailing slashes and case differences', () => {
    expect(isOriginAllowed('https://aish-s-fabriik-mp.vercel.app/', allowed)).toBe(true);
    expect(isOriginAllowed('HTTPS://AISH-S-FABRIIK-MP.VERCEL.APP', allowed)).toBe(true);
  });

  it('rejects origins that are not allowlisted', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:9999', allowed)).toBe(false);
  });

  it('rejects any present origin when the allowlist is empty', () => {
    expect(isOriginAllowed('https://evil.example.com', [])).toBe(false);
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });
});
