import { afterEach, describe, expect, it } from 'vitest';
import type { LlmProvider } from './types';
import { DEFAULT_PROVIDER_ID, clearLlmProviderOverrides, createLlmProvider, listProviders, setLlmProviderOverride } from './index';
import { geminiProvider } from './gemini';

const fakeProvider: LlmProvider = {
  id: 'gemini',
  label: 'Fake',
  requiresKey: false,
  defaultModel: 'fake-model',
  models: ['fake-model'],
  complete: async () => ({ text: '' }),
};

describe('LLM provider factory (approved design: registry + test overrides)', () => {
  afterEach(() => {
    clearLlmProviderOverrides();
  });

  it('exposes Gemini as the default provider', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('gemini');
    expect(createLlmProvider('gemini')).toBe(geminiProvider);
  });

  it('returns the registered provider for each known id', () => {
    for (const provider of listProviders()) {
      expect(createLlmProvider(provider.id)).toBe(provider);
      expect(provider.label.length).toBeGreaterThan(0);
      expect(provider.defaultModel.length).toBeGreaterThan(0);
    }
    expect(listProviders().map((p) => p.id)).toContain('gemini');
  });

  it('applies test overrides until they are cleared', () => {
    setLlmProviderOverride('gemini', fakeProvider);
    expect(createLlmProvider('gemini')).toBe(fakeProvider);
    clearLlmProviderOverrides();
    expect(createLlmProvider('gemini')).toBe(geminiProvider);
  });
});
