import type { LlmCompleteRequest, LlmCompleteResult, LlmProvider, ProviderErrorCode } from './types';
import { ProviderError } from './types';
import { createModelsLister, extractDataModelIds } from './openaiCompatible';

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_MODELS_ENDPOINT = 'https://api.anthropic.com/v1/models';

const STATUS_CODES: Record<number, ProviderErrorCode> = { 401: 'auth', 403: 'auth', 429: 'rate-limit' };

interface AnthropicMessagesResponse {
  content?: { type?: string; text?: string }[];
}

export function createAnthropicProvider(fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    id: 'anthropic',
    label: 'Anthropic',
    requiresKey: true,
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
      const { model, apiKey, system, user, schema, signal } = request;
      if (!apiKey) {
        throw new ProviderError('auth', 'Anthropic requires an API key. Add one in AI settings.');
      }

      const structuredSystem = `${system}\n\nRespond with a single JSON object valid against this JSON Schema:\n${JSON.stringify(schema)}`;

      let response: Response;
      try {
        response = await fetchImpl(ANTHROPIC_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            temperature: 0.2,
            system: structuredSystem,
            messages: [{ role: 'user', content: user }],
          }),
          signal,
        });
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `Anthropic request failed${detail}`);
      }

      if (!response.ok) {
        const code = STATUS_CODES[response.status] ?? 'network';
        throw new ProviderError(code, `Anthropic request failed with status ${response.status} ${response.statusText}`.trim());
      }

      let payload: AnthropicMessagesResponse;
      try {
        payload = (await response.json()) as AnthropicMessagesResponse;
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `Anthropic response was not valid JSON${detail}`);
      }

      const text = (payload.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');
      return { text };
    },
    listModels: createModelsLister(
      {
        label: 'Anthropic',
        modelsEndpoint: ANTHROPIC_MODELS_ENDPOINT,
        requiresKey: true,
        buildHeaders: (apiKey) =>
          apiKey
            ? {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
              }
            : {},
        extractModels: extractDataModelIds,
      },
      fetchImpl,
    ),
  };
}

export const anthropicProvider: LlmProvider = createAnthropicProvider();
