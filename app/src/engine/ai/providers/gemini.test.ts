import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_OUTPUT_JSON_SCHEMA } from '../outputSchema';
import { GEMINI_ENDPOINT, createGeminiProvider, geminiProvider } from './gemini';
import { ProviderError } from './types';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const geminiTextResponse = {
  candidates: [{ content: { parts: [{ text: '{"proposals":[]}' }] } }],
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

describe('Gemini provider (spec ai-byok §6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes provider metadata with a free-tier default model', () => {
    expect(geminiProvider.id).toBe('gemini');
    expect(geminiProvider.label.length).toBeGreaterThan(0);
    expect(geminiProvider.requiresKey).toBe(true);
    expect(geminiProvider.models).toContain(geminiProvider.defaultModel);
    expect(typeof geminiProvider.complete).toBe('function');
  });

  it('sends a structured-output request with the key in a header, never in the URL', async () => {
    const { fetchImpl, calls } = makeFetch(200, geminiTextResponse);
    const provider = createGeminiProvider(fetchImpl);
    const result = await provider.complete({
      model: 'gemini-2.5-flash',
      apiKey: 'test-key',
      system: 'SYS',
      user: 'USER',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '{"proposals":[]}' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${GEMINI_ENDPOINT}/gemini-2.5-flash:generateContent`);
    expect(calls[0].url).not.toContain('test-key');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key');
    expect(headers.Authorization).toBeUndefined();
    const body = JSON.parse(String(calls[0].init.body)) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: { text: string }[] }[];
      generationConfig: {
        responseMimeType: string;
        responseJsonSchema: unknown;
      };
    };
    expect(body.systemInstruction.parts[0].text).toBe('SYS');
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe('USER');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema).toEqual(AI_OUTPUT_JSON_SCHEMA);
  });

  it('forwards the abort signal to fetch', async () => {
    const { fetchImpl, calls } = makeFetch(200, geminiTextResponse);
    const provider = createGeminiProvider(fetchImpl);
    const controller = new AbortController();
    await provider.complete({
      model: 'gemini-2.5-flash',
      apiKey: 'k',
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
      signal: controller.signal,
    });
    expect(calls[0].init.signal).toBe(controller.signal);
  });

  it('joins multiple candidate text parts', async () => {
    const { fetchImpl } = makeFetch(200, {
      candidates: [{ content: { parts: [{ text: '{"pro' }, { text: 'posals":[]}' }] } }],
    });
    const provider = createGeminiProvider(fetchImpl);
    const result = await provider.complete({
      model: 'gemini-2.5-flash',
      apiKey: 'k',
      system: 's',
      user: 'u',
      schema: AI_OUTPUT_JSON_SCHEMA,
    });
    expect(result).toEqual({ text: '{"proposals":[]}' });
  });

  it('resolves with empty text when the response has no candidates', async () => {
    const { fetchImpl } = makeFetch(200, { promptFeedback: { blockReason: 'SAFETY' } });
    const provider = createGeminiProvider(fetchImpl);
    const result = await provider.complete({
      model: 'gemini-2.5-flash',
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
      const provider = createGeminiProvider(fetchImpl);
      await expect(
        provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
      ).rejects.toMatchObject({ code: 'auth', name: 'ProviderError' } satisfies Partial<ProviderError>);
    }
  });

  it('maps 429 to a rate-limit error', async () => {
    const { fetchImpl } = makeFetch(429, { error: { message: 'quota' } });
    const provider = createGeminiProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('maps other HTTP failures to a network error with the status in the message', async () => {
    const { fetchImpl } = makeFetch(500, { error: { message: 'boom' } });
    const provider = createGeminiProvider(fetchImpl);
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
    const provider = createGeminiProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: 'k', system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects with an auth error before any network call when no key is set', async () => {
    const { fetchImpl, calls } = makeFetch(200, geminiTextResponse);
    const provider = createGeminiProvider(fetchImpl);
    await expect(
      provider.complete({ model: 'm', apiKey: null, system: 's', user: 'u', schema: AI_OUTPUT_JSON_SCHEMA }),
    ).rejects.toMatchObject({ code: 'auth' });
    expect(calls).toHaveLength(0);
  });
});
