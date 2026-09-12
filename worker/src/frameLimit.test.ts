import { describe, expect, it } from 'vitest';
import { FRAME_SIZE_LIMIT_BYTES, exceedsFrameSizeLimit } from './frameLimit';

describe('exceedsFrameSizeLimit', () => {
  it('caps frames at 256 KiB', () => {
    expect(FRAME_SIZE_LIMIT_BYTES).toBe(256 * 1024);
  });

  it('accepts frames up to and including the limit', () => {
    expect(exceedsFrameSizeLimit(new Uint8Array(0))).toBe(false);
    expect(exceedsFrameSizeLimit(new Uint8Array(FRAME_SIZE_LIMIT_BYTES))).toBe(false);
  });

  it('rejects frames beyond the limit', () => {
    expect(exceedsFrameSizeLimit(new Uint8Array(FRAME_SIZE_LIMIT_BYTES + 1))).toBe(true);
  });

  it('honours a custom limit', () => {
    expect(exceedsFrameSizeLimit(new Uint8Array(10), 10)).toBe(false);
    expect(exceedsFrameSizeLimit(new Uint8Array(11), 10)).toBe(true);
  });
});
