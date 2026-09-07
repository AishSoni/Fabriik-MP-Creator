import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_OUTPUT_JSON_SCHEMA } from '../outputSchema';
import { ANTHROPIC_ENDPOINT, anthropicProvider, createAnthropicProvider } from './anthropic';
import { ProviderError } from './types';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const anthropicTextResponse = {
  content: [{ type: 'text', text: '{"proposals":[]}' }],
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

describe('Anthropic provider (spec ai-byok §6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes provider metadata with a default model', () => {
    expect(anthropicProvider.id).toBe('anthropic');
    expect(anthropicProvider.label).toBe('Anthropic');
    expect(anthropicProvider.requiresKey).toBe(true);
    expect(anthropicProvider.models).toContain(anthropicProvider.defaultModel);
    expect(typeof anthropicProvider.complete).toBe('function');
  });

  it('sends a messages request with header auth and browser-access opt-in, never the key in the URL', async () => {
    const { fetchImpl, calls } = makeFetch(200, anthropicTextResponse);
    const provider = createAnthropicProvider(fetchImpl);
    const result = await provider.complete({
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      system: 'SYS',
      user: 'USER',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '{"proposals":[]}' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ANTHROPIC_ENDPOINT);
    expect(calls[0].url).not.toContain('test-key');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(calls[0].init.body)) as {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(typeof body.max_tokens).toBe('number');
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([{ role: 'user', content: 'USER' }]);
    expect(body.system.startsWith('SYS')).toBe(true);
    expect(body.system).toContain(JSON.stringify(AI_OUTPUT_JSON_SCHEMA));
  });

  it('forwards the abort signal to fetch', async () => {
    const { fetchImpl, calls } = makeFetch(200, anthropicTextResponse);
    const provider = createAnthropicProvider(fetchImpl);
    const controller = new AbortController();
    await provider.complete({
      model: 'claude-sonnet-4-5',
      apiKey: 'k',
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
      signal: controller.signal,
    });
    expect(calls[0].init.signal).toBe(controller.signal);
  });

  it('joins only the text blocks of the response content', async () => {
    const { fetchImpl } = makeFetch(200, {
      content: [{ type: 'text', text: '{"pro' }, { type: 'tool_use', id: 't1' }, { type: 'text', text: 'posals":[]}' }],
    });
    const provider = createAnthropicProvider(fetchImpl);
    const result = await provider.complete({
      model: 'claude-sonnet-4-5',
      apiKey: 'k',
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '{"proposals":[]}' });
  });

  it('resolves with empty text when the response has no content blocks', async () => {
    const { fetchImpl } = makeFetch(200, {});
    const provider = createAnthropicProvider(fetchImpl);
    const result = await provider.complete({
      model: 'claude-sonnet-4-5',
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
      const provider = createAnthropicProvider(fetchImpl);
      await expect(
        provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
      ).rejects.toMatchObject({ code: 'auth', name: 'ProviderError' } satisfies Partial<ProviderError>);
    }
  });

  it('maps 429 to a rate-limit error', async () => {
    const { fetchImpl } = makeFetch(429, { error: { message: 'quota' } });
    const provider = createAnthropicProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('maps other HTTP failures to a network error with the status in the message', async () => {
    const { fetchImpl } = makeFetch(500, { error: { message: 'boom' } });
    const provider = createAnthropicProvider(fetchImpl);
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
    const provider = createAnthropicProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects with an auth error before any network call when no key is set', async () => {
    const { fetchImpl, calls } = makeFetch(200, anthropicTextResponse);
    const provider = createAnthropicProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: null, system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'auth' });
    expect(calls).toHaveLength(0);
  });
});
