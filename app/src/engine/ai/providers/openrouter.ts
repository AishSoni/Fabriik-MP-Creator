import { createChatCompletionsProvider } from './openaiCompatible';
import type { LlmProvider } from './types';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export function createOpenRouterProvider(fetchImpl: typeof fetch = fetch): LlmProvider {
  return createChatCompletionsProvider(
    {
      id: 'openrouter',
      label: 'OpenRouter',
      endpoint: OPENROUTER_ENDPOINT,
      requiresKey: true,
      defaultModel: 'openai/gpt-4o-mini',
      models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
    },
    fetchImpl,
  );
}

export const openRouterProvider: LlmProvider = createOpenRouterProvider();
