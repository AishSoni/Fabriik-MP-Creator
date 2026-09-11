import type { DemoError } from '../../types/proposal';

export const ERROR_TITLES: Record<DemoError['code'], string> = {
  'unsupported-instruction': 'Unsupported instruction',
  'unselected-target': 'Target outside selection',
  'forbidden-field': 'Forbidden field',
  'provider-auth': 'Provider rejected your key',
  'provider-rate-limit': 'Provider rate limit',
  'provider-network': 'Provider unreachable',
  'provider-parse': 'Provider response invalid',
};
