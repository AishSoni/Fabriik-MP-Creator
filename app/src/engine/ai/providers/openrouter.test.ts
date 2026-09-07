import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_OUTPUT_JSON_SCHEMA } from '../outputSchema';
import { OPENROUTER_ENDPOINT, createOpenRouterProvider, openRouterProvider } from './openrouter';
import { ProviderError } from './types';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const openRouterTextResponse = {
  choices: [{ message: { content: '{"proposals":[]}' } }],
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

describe('OpenRouter provider (spec ai-byok §6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes provider metadata with a default model', () => {
    expect(openRouterProvider.id).toBe('openrouter');
    expect(openRouterProvider.label).toBe('OpenRouter');
    expect(openRouterProvider.requiresKey).toBe(true);
    expect(openRouterProvider.models).toContain(openRouterProvider.defaultModel);
    expect(typeof openRouterProvider.complete).toBe('function');
  });

  it('sends a chat-completions request with Bearer auth and structured output to the OpenRouter endpoint', async () => {
    const { fetchImpl, calls } = makeFetch(200, openRouterTextResponse);
    const provider = createOpenRouterProvider(fetchImpl);
    const result = await provider.complete({
      model: 'openai/gpt-4o-mini',
      apiKey: 'test-key',
      system: 'SYS',
      user: 'USER',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '{"proposals":[]}' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OPENROUTER_ENDPOINT);
    expect(calls[0].url).not.toContain('test-key');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(calls[0].init.body)) as {
      model: string;
      temperature: number;
      messages: { role: string; content: string }[];
      response_format: { type: string; json_schema: { name: string; schema: unknown } };
    };
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.temperature).toBe(0.2);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'USER' });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('ai_output');
    expect(body.response_format.json_schema.schema).toEqual(AI_OUTPUT_JSON_SCHEMA);
  });

  it('forwards the abort signal to fetch', async () => {
    const { fetchImpl, calls } = makeFetch(200, openRouterTextResponse);
    const provider = createOpenRouterProvider(fetchImpl);
    const controller = new AbortController();
    await provider.complete({
      model: 'openai/gpt-4o-mini',
      apiKey: 'k',
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
      signal: controller.signal,
    });
    expect(calls[0].init.signal).toBe(controller.signal);
  });

  it('resolves with empty text when the response has no choices', async () => {
    const { fetchImpl } = makeFetch(200, { choices: [] });
    const provider = createOpenRouterProvider(fetchImpl);
    const result = await provider.complete({
      model: 'openai/gpt-4o-mini',
      apiKey: 'k',
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '' });
  });

  it('maps 401 and 403 to an auth error', async () => {
    for (const status of [401, 403]) {
      const { fetchImpl } = makeFetch(status, { error: { message: 'bad key' } });
      const provider = createOpenRouterProvider(fetchImpl);
      await expect(
        provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
      ).rejects.toMatchObject({ code: 'auth', name: 'ProviderError' } satisfies Partial<ProviderError>);
    }
  });

  it('maps 429 to a rate-limit error', async () => {
    const { fetchImpl } = makeFetch(429, { error: { message: 'quota' } });
    const provider = createOpenRouterProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('maps other HTTP failures to a network error with the status in the message', async () => {
    const { fetchImpl } = makeFetch(500, { error: { message: 'boom' } });
    const provider = createOpenRouterProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe('network');
      expect((error as ProviderError).message).toContain('500');
      return true;
    });
  });

  it('maps fetch rejections to a network error', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const provider = createOpenRouterProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects with an auth error before any network call when no key is set', async () => {
    const { fetchImpl, calls } = makeFetch(200, openRouterTextResponse);
    const provider = createOpenRouterProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: null, system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'auth' });
    expect(calls).toHaveLength(0);
  });
});
