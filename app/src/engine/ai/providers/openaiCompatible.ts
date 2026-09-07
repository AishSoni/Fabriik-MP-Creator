import type { LlmCompleteRequest, LlmCompleteResult, LlmListModelsRequest, LlmProvider, ProviderErrorCode } from './types';
import { ProviderError } from './types';

const STATUS_CODES: Record<number, ProviderErrorCode> = { 401: 'auth', 403: 'auth', 429: 'rate-limit' };

interface ChatCompletionsResponse {
  choices?: { message?: { content?: unknown } }[];
}

export function extractChatCompletionsText(payload: ChatCompletionsResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

export interface ChatCompletionsProviderConfig {
  id: LlmProvider['id'];
  label: string;
  endpoint: string;
  requiresKey: boolean;
  defaultModel: string;
  models: readonly string[];
  /**
   * Whether every model behind this endpoint supports `response_format: json_schema`.
   * OpenAI does natively; for routers (OpenRouter) support is per-endpoint — see
   * https://openrouter.ai/docs/guides/features/structured-outputs.
   */
  structuredOutputs: boolean;
  /**
   * OpenRouter-style provider routing preferences sent as the `provider` body
   * field. Per the OpenRouter structured-outputs guide, `require_parameters:
   * true` routes the request only to endpoints that support every parameter
   * passed (including `response_format`), instead of failing on upstreams that
   * lack structured-output support.
   */
  providerRouting?: Record<string, unknown>;
  /**
   * When true, a 400/404 on the structured attempt (no endpoint behind
   * require_parameters supports the params, or an upstream still rejecting
   * them) is retried once WITHOUT response_format and provider routing — the
   * JSON-only system prompt plus parseProposals remain the enforcement layer.
   */
  retryWithoutStructuredOutputs?: boolean;
}

export function createChatCompletionsProvider(
  config: ChatCompletionsProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Omit<LlmProvider, 'listModels'> {
  return {
    id: config.id,
    label: config.label,
    requiresKey: config.requiresKey,
    defaultModel: config.defaultModel,
    models: config.models,
    async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
      const { model, apiKey, system, user, schema, signal } = request;
      if (config.requiresKey && !apiKey) {
        throw new ProviderError('auth', `${config.label} requires an API key. Add one in AI settings.`);
      }

      const attempt = async (structured: boolean): Promise<Response> => {
        try {
          return await fetchImpl(config.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
              model,
              temperature: 0.2,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              ...(structured && config.structuredOutputs
                ? { response_format: { type: 'json_schema', json_schema: { name: 'ai_output', schema } } }
                : {}),
              ...(structured && config.providerRouting ? { provider: config.providerRouting } : {}),
            }),
            signal,
          });
        } catch (error) {
          const detail = error instanceof Error ? `: ${error.message}` : '';
          throw new ProviderError('network', `${config.label} request failed${detail}`);
        }
      };

      let response = await attempt(true);
      if (!response.ok && config.retryWithoutStructuredOutputs && (response.status === 400 || response.status === 404)) {
        response = await attempt(false);
      }

      if (!response.ok) {
        const code = STATUS_CODES[response.status] ?? 'network';
        throw new ProviderError(code, `${config.label} request failed with status ${response.status} ${response.statusText}`.trim());
      }

      let payload: ChatCompletionsResponse;
      try {
        payload = (await response.json()) as ChatCompletionsResponse;
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new ProviderError('network', `${config.label} response was not valid JSON${detail}`);
      }

      return { text: extractChatCompletionsText(payload) };
    },
  };
}

export function extractDataModelIds(payload: unknown): string[] {
  const data = (payload as { data?: { id?: unknown }[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry): entry is { id: string } => typeof entry?.id === 'string' && entry.id.length > 0)
    .map((entry) => entry.id);
}

export interface ModelsListerConfig {
  label: string;
  modelsEndpoint: string;
  requiresKey: boolean;
  buildHeaders(apiKey: string | null): Record<string, string>;
  extractModels(payload: unknown): string[];
}

export function createModelsLister(config: ModelsListerConfig, fetchImpl: typeof fetch = fetch) {
  return async function listModels(request: LlmListModelsRequest): Promise<readonly string[]> {
    if (config.requiresKey && !request.apiKey) {
      throw new ProviderError('auth', `${config.label} requires an API key. Add one in AI settings.`);
    }

    let response: Response;
    try {
      response = await fetchImpl(config.modelsEndpoint, {
        method: 'GET',
        headers: config.buildHeaders(request.apiKey),
        signal: request.signal,
      });
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      throw new ProviderError('network', `${config.label} model list request failed${detail}`);
    }

    if (!response.ok) {
      const code = STATUS_CODES[response.status] ?? 'network';
      throw new ProviderError(
        code,
        `${config.label} model list request failed with status ${response.status} ${response.statusText}`.trim(),
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      throw new ProviderError('network', `${config.label} model list response was not valid JSON${detail}`);
    }

    return config.extractModels(payload);
  };
}
