import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_OUTPUT_JSON_SCHEMA } from '../outputSchema';
import { OLLAMA_ENDPOINT, OLLAMA_MODELS_ENDPOINT, createOllamaProvider, ollamaProvider } from './ollama';
import { ProviderError } from './types';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ollamaTextResponse = {
  message: { content: '{"proposals":[]}' },
};

type RecordedCall = { url: string; init: RequestInit };

function makeFetch(status: number, body: unknown): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return okResponse(body, status);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('Ollama provider (spec ai-byok §6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes provider metadata and needs no API key', () => {
    expect(ollamaProvider.id).toBe('ollama');
    expect(ollamaProvider.label).toContain('Ollama');
    expect(ollamaProvider.requiresKey).toBe(false);
    expect(ollamaProvider.models).toContain(ollamaProvider.defaultModel);
    expect(typeof ollamaProvider.complete).toBe('function');
  });

  it('sends a local chat request with structured output and no auth headers', async () => {
    const { fetchImpl, calls } = makeFetch(200, ollamaTextResponse);
    const provider = createOllamaProvider(fetchImpl);
    const result = await provider.complete({
      model: 'llama3.2',
      apiKey: null,
      system: 'SYS',
      user: 'USER',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '{"proposals":[]}' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OLLAMA_ENDPOINT);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
    const body = JSON.parse(String(calls[0].init.body)) as {
      model: string;
      stream: boolean;
      messages: { role: string; content: string }[];
      format: unknown;
      options: { temperature: number };
    };
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'USER' });
    expect(body.format).toEqual(AI_OUTPUT_JSON_SCHEMA);
    expect(body.options.temperature).toBe(0.2);
  });

  it('forwards the abort signal to fetch', async () => {
    const { fetchImpl, calls } = makeFetch(200, ollamaTextResponse);
    const provider = createOllamaProvider(fetchImpl);
    const controller = new AbortController();
    await provider.complete({
      model: 'llama3.2',
      apiKey: null,
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
      signal: controller.signal,
    });
    expect(calls[0].init.signal).toBe(controller.signal);
  });

  it('resolves with empty text when the response has no message content', async () => {
    const { fetchImpl } = makeFetch(200, {});
    const provider = createOllamaProvider(fetchImpl);
    const result = await provider.complete({
      model: 'llama3.2',
      apiKey: null,
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '' });
  });

  it('maps HTTP failures like a missing model (404) to a network error with the status in the message', async () => {
    const { fetchImpl } = makeFetch(404, { error: 'model not found' });
    const provider = createOllamaProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'llama3.2', apiKey: null, system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe('network');
      expect((error as ProviderError).message).toContain('404');
      return true;
    });
  });

  it('maps 429 to a rate-limit error', async () => {
    const { fetchImpl } = makeFetch(429, { error: 'busy' });
    const provider = createOllamaProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'llama3.2', apiKey: null, system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('maps fetch rejections (server not running) to a network error', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const provider = createOllamaProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'llama3.2', apiKey: null, system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('Ollama listModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries /api/tags without auth headers and maps model names', async () => {
    const { fetchImpl, calls } = makeFetch(200, { models: [{ name: 'llama3.2' }, { name: 'qwen2.5' }, { name: 9 }] });
    const provider = createOllamaProvider(fetchImpl);
    const models = await provider.listModels({ apiKey: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OLLAMA_MODELS_ENDPOINT);
    expect(calls[0].init.method).toBe('GET');
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
    expect(models).toEqual(['llama3.2', 'qwen2.5']);
  });

  it('maps 404 to a network error with the status and 429 to rate-limit', async () => {
    const missing = createOllamaProvider(makeFetch(404, {}).fetchImpl);
    await expect(missing.listModels({ apiKey: null })).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe('network');
      expect((error as ProviderError).message).toContain('404');
      return true;
    });
    const limited = createOllamaProvider(makeFetch(429, {}).fetchImpl);
    await expect(limited.listModels({ apiKey: null })).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('maps fetch rejections to a network error', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const provider = createOllamaProvider(fetchImpl);
    await expect(provider.listModels({ apiKey: null })).rejects.toMatchObject({ code: 'network' });
  });
});
