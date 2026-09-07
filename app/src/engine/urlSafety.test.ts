import { describe, expect, it } from 'vitest';
import { isSafeUrl } from './urlSafety';

describe('isSafeUrl', () => {
  it('allows safe schemes', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:hi@example.com')).toBe(true);
    expect(isSafeUrl('tel:+15551234567')).toBe(true);
    expect(isSafeUrl('HTTPS://EXAMPLE.COM')).toBe(true);
  });

  it('allows relative URLs and fragments', () => {
    expect(isSafeUrl('')).toBe(true);
    expect(isSafeUrl('#')).toBe(true);
    expect(isSafeUrl('#about')).toBe(true);
    expect(isSafeUrl('/pricing')).toBe(true);
    expect(isSafeUrl('about/team')).toBe(true);
    expect(isSafeUrl('page.html?x=1')).toBe(true);
    expect(isSafeUrl('//example.com/cdn')).toBe(true);
  });

  it('rejects javascript: and data: and other schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('file:///C:/Windows')).toBe(false);
    expect(isSafeUrl('ftp://example.com')).toBe(false);
  });

  it('rejects scheme detection evasion via stripped whitespace', () => {
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeUrl('j\navascript:alert(1)')).toBe(false);
    expect(isSafeUrl(' j a v a s c r i p t :alert(1)')).toBe(false);
    expect(isSafeUrl('\tjavascript:alert(1)')).toBe(false);
  });
});
