import { geminiProvider } from './gemini';
import type { LlmProvider, ProviderId } from './types';

export const DEFAULT_PROVIDER_ID: ProviderId = 'gemini';

const registry: Partial<Record<ProviderId, LlmProvider>> = {
  gemini: geminiProvider,
};

const overrides = new Map<ProviderId, LlmProvider>();

export function createLlmProvider(id: ProviderId): LlmProvider {
  const override = overrides.get(id);
  if (override) return override;
  const provider = registry[id];
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export function setLlmProviderOverride(id: ProviderId, provider: LlmProvider): void {
  overrides.set(id, provider);
}

export function clearLlmProviderOverrides(): void {
  overrides.clear();
}

export function listProviders(): LlmProvider[] {
  return Object.values(registry) as LlmProvider[];
}
