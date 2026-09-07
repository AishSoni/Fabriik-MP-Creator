export type ProviderId = 'gemini' | 'openai' | 'openrouter' | 'anthropic' | 'ollama';

export type ProviderErrorCode = 'auth' | 'rate-limit' | 'network';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

export interface LlmCompleteRequest {
  model: string;
  apiKey: string | null;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LlmCompleteResult {
  text: string;
}

export interface LlmProvider {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  defaultModel: string;
  models: readonly string[];
  complete(request: LlmCompleteRequest): Promise<LlmCompleteResult>;
}
