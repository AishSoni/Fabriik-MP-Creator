import type { LlmCompleteRequest, LlmCompleteResult, LlmProvider, ProviderErrorCode } from './types';
import { ProviderError } from './types';

export const OLLAMA_ENDPOINT = 'http://localhost:11434/api/chat';

const STATUS_CODES: Record<number, ProviderErrorCode> = { 401: 'auth', 403: 'auth', 429: 'rate-limit' };

interface OllamaChatResponse {
  message?: { content?: string };
}

export function createOllamaProvider(fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    id: 'ollama',
    label: 'Ollama (local)',
    requiresKey: false,
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'qwen2.5', 'mistral'],
    async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
      const { model, system, user, schema, signal } = request;

      let response: Response;
      try {
        response = await fetchImpl(OLLAMA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            format: schema,
            options: { temperature: 0.2 },
          }),
          signal,
        });
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `Ollama request failed${detail}`);
      }

      if (!response.ok) {
        const code = STATUS_CODES[response.status] ?? 'network';
        throw new ProviderError(code, `Ollama request failed with status ${response.status} ${response.statusText}`.trim());
      }

      let payload: OllamaChatResponse;
      try {
        payload = (await response.json()) as OllamaChatResponse;
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `Ollama response was not valid JSON${detail}`);
      }

      const content = payload.message?.content;
      return { text: typeof content === 'string' ? content : '' };
    },
  };
}

export const ollamaProvider: LlmProvider = createOllamaProvider();
