import { createChatCompletionsProvider, createModelsLister, extractDataModelIds } from './openaiCompatible';
import type { LlmProvider } from './types';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

export function createOpenRouterProvider(fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    ...createChatCompletionsProvider(
      {
        id: 'openrouter',
        label: 'OpenRouter',
        endpoint: OPENROUTER_ENDPOINT,
        requiresKey: true,
        defaultModel: 'openai/gpt-4o-mini',
        models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
        structuredOutputs: false,
      },
      fetchImpl,
    ),
    listModels: createModelsLister(
      {
        label: 'OpenRouter',
        modelsEndpoint: OPENROUTER_MODELS_ENDPOINT,
        requiresKey: true,
        buildHeaders: (apiKey): Record<string, string> => {
          if (!apiKey) return {};
          return { Authorization: `Bearer ${apiKey}` };
        },
        extractModels: extractDataModelIds,
      },
      fetchImpl,
    ),
  };
}

export const openRouterProvider: LlmProvider = createOpenRouterProvider();
