import { createChatCompletionsProvider, createModelsLister, extractDataModelIds } from './openaiCompatible';
import type { LlmProvider } from './types';

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';

export function createOpenAiProvider(fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    ...createChatCompletionsProvider(
      {
        id: 'openai',
        label: 'OpenAI',
        endpoint: OPENAI_ENDPOINT,
        requiresKey: true,
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
        structuredOutputs: true,
      },
      fetchImpl,
    ),
    listModels: createModelsLister(
      {
        label: 'OpenAI',
        modelsEndpoint: OPENAI_MODELS_ENDPOINT,
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

export const openAiProvider: LlmProvider = createOpenAiProvider();
