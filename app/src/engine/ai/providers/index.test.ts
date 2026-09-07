import { afterEach, describe, expect, it } from 'vitest';
import type { LlmProvider, ProviderId } from './types';
import { DEFAULT_PROVIDER_ID, clearLlmProviderOverrides, createLlmProvider, listProviders, setLlmProviderOverride } from './index';
import { geminiProvider } from './gemini';
import { openAiProvider } from './openai';
import { openRouterProvider } from './openrouter';
import { anthropicProvider } from './anthropic';
import { ollamaProvider } from './ollama';

const ALL_PROVIDER_IDS: ProviderId[] = ['gemini', 'openai', 'openrouter', 'anthropic', 'ollama'];

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

  it('registers every v1 provider id', () => {
    expect([...listProviders().map((p) => p.id)].sort()).toEqual([...ALL_PROVIDER_IDS].sort());
  });

  it('returns the registered provider for each known id', () => {
    const registered = new Map(listProviders().map((p) => [p.id, p]));
    expect(registered.get('gemini')).toBe(geminiProvider);
    expect(registered.get('openai')).toBe(openAiProvider);
    expect(registered.get('openrouter')).toBe(openRouterProvider);
    expect(registered.get('anthropic')).toBe(anthropicProvider);
    expect(registered.get('ollama')).toBe(ollamaProvider);
    for (const provider of listProviders()) {
      expect(createLlmProvider(provider.id)).toBe(provider);
      expect(provider.label.length).toBeGreaterThan(0);
      expect(provider.defaultModel.length).toBeGreaterThan(0);
      expect(provider.models).toContain(provider.defaultModel);
    }
  });

  it('requires keys only for hosted providers', () => {
    expect(listProviders().filter((p) => p.requiresKey).map((p) => p.id).sort()).toEqual(['anthropic', 'gemini', 'openai', 'openrouter']);
    expect(ollamaProvider.requiresKey).toBe(false);
  });

  it('applies test overrides until they are cleared', () => {
    setLlmProviderOverride('gemini', fakeProvider);
    expect(createLlmProvider('gemini')).toBe(fakeProvider);
    clearLlmProviderOverrides();
    expect(createLlmProvider('gemini')).toBe(geminiProvider);
  });
});
