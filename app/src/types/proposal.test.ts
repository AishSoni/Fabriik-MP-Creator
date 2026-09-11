import { describe, expect, it } from 'vitest';
import type { DemoErrorCode } from './proposal';
import { ERROR_TITLES } from '../components/panels/errorTitles';

const CODES: DemoErrorCode[] = [
  'unsupported-instruction',
  'unselected-target',
  'forbidden-field',
  'provider-auth',
  'provider-rate-limit',
  'provider-network',
  'provider-parse',
];

describe('DemoErrorCode extension (spec ai-byok §10)', () => {
  it('defines the four provider error codes', () => {
    const exhaustive: Record<DemoErrorCode, true> = {
      'unsupported-instruction': true,
      'unselected-target': true,
      'forbidden-field': true,
      'provider-auth': true,
      'provider-rate-limit': true,
      'provider-network': true,
      'provider-parse': true,
    };
    expect(Object.keys(exhaustive).sort()).toEqual([...CODES].sort());
  });

  it('ERROR_TITLES covers every error code', () => {
    expect(Object.keys(ERROR_TITLES).sort()).toEqual([...CODES].sort());
    for (const code of CODES) {
      expect(ERROR_TITLES[code].length).toBeGreaterThan(0);
    }
  });
});
