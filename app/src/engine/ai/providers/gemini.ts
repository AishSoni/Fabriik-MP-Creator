import type { LlmCompleteRequest, LlmCompleteResult, LlmProvider, ProviderErrorCode } from './types';
import { ProviderError } from './types';

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const STATUS_CODES: Record<number, ProviderErrorCode> = { 401: 'auth', 403: 'auth', 429: 'rate-limit' };

interface GeminiGenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export function createGeminiProvider(fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    id: 'gemini',
    label: 'Google Gemini',
    requiresKey: true,
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
      const { model, apiKey, system, user, schema, signal } = request;
      if (!apiKey) {
        throw new ProviderError('auth', 'Gemini requires an API key. Add one in AI settings.');
      }

      const url = `${GEMINI_ENDPOINT}/${model}:generateContent`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseJsonSchema: schema,
            },
          }),
          signal,
        });
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `Gemini request failed${detail}`);
      }

      if (!response.ok) {
        const code = STATUS_CODES[response.status] ?? 'network';
        throw new ProviderError(code, `Gemini request failed with status ${response.status} ${response.statusText}`.trim());
      }

      let payload: GeminiGenerateContentResponse;
      try {
        payload = (await response.json()) as GeminiGenerateContentResponse;
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `Gemini response was not valid JSON${detail}`);
      }

      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text)
        .filter((part): part is string => typeof part === 'string')
        .join('');
      return { text };
    },
  };
}

export const geminiProvider: LlmProvider = createGeminiProvider();
