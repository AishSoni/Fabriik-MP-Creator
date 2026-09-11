import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../../template/defaultTemplate';
import { AI_OUTPUT_JSON_SCHEMA } from './outputSchema';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { clearLlmProviderOverrides, setLlmProviderOverride } from './providers';
import { ProviderError } from './providers/types';
import type { LlmCompleteRequest, LlmProvider } from './providers/types';
import type { DemoInput, DemoResult } from '../../types/proposal';
import { createByokEngine } from './byokEngine';

const doc = () => createDefaultTemplate();

const input = (overrides: Partial<DemoInput> = {}): DemoInput => ({
  instruction: 'Make the heading more exciting',
  selectedIds: ['hero-heading'],
  scope: 'all',
  ...overrides,
});

function fakeProvider(
  respond: () => Promise<{ text: string }>,
): { provider: LlmProvider; calls: LlmCompleteRequest[] } {
  const calls: LlmCompleteRequest[] = [];
  const provider: LlmProvider = {
    id: 'gemini',
    label: 'Fake Gemini',
    requiresKey: true,
    defaultModel: 'fake-flash',
    models: ['fake-flash'],
    complete: async (request) => {
      calls.push(request);
      return respond();
    },
    listModels: async () => ['fake-flash'],
  };
  return { provider, calls };
}

const validOutput = {
  proposals: [
    {
      targetId: 'hero-heading',
      explanation: 'Punch up the headline copy',
      command: {
        kind: 'set-content',
        targetIds: ['hero-heading'],
        content: { text: 'Boom! A headline that sells.' },
      },
    },
  ],
};

afterEach(() => {
  clearLlmProviderOverrides();
});

describe('ByokEngine (spec ai-byok §6, §8 decision, §10)', () => {
  it('maps a valid structured response into reviewable proposals above the factory', async () => {
    const { provider, calls } = fakeProvider(() => Promise.resolve({ text: JSON.stringify(validOutput) }));
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: 'fake-flash', apiKey: 'key-1' });
    const result: DemoResult = await engine.run(input(), doc());

    expect(result.error).toBeUndefined();
    expect(result.proposals).toHaveLength(1);
    const proposal = result.proposals[0];
    expect(proposal.command.source).toBe('ai');
    expect(proposal.command.scope).toBe('all');
    expect('baseRevision' in proposal.command).toBe(false);
    expect(proposal.proposalId).toBe('p-0-hero-heading-0');
    expect(proposal.before.content).toEqual({ text: 'Main Hero Message to Sell Yourself!' });
    expect(proposal.after.content).toEqual({ text: 'Boom! A headline that sells.' });

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('fake-flash');
    expect(calls[0].apiKey).toBe('key-1');
    expect(calls[0].system).toBe(buildSystemPrompt());
    expect(calls[0].schema).toBe(AI_OUTPUT_JSON_SCHEMA);
    expect(calls[0].user).toBe(buildUserPrompt(input(), doc()));
  });

  it('refuses to run without an API key before contacting the provider', async () => {
    const { provider, calls } = fakeProvider(() => {
      throw new Error('must not be called');
    });
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: 'fake-flash', apiKey: null });
    const result = await engine.run(input(), doc());

    expect(calls).toHaveLength(0);
    expect(result.proposals).toEqual([]);
    expect(result.error?.code).toBe('provider-auth');
  });

  it('reports unknown provider ids as a network-class engine error', async () => {
    const engine = createByokEngine({ providerId: 'nonexistent', modelId: null, apiKey: 'key-1' });
    const result = await engine.run(input(), doc());

    expect(result.error?.code).toBe('provider-network');
    expect(result.error?.message).toContain('Unknown provider');
  });

  it('maps provider errors to demo error codes (§10)', async () => {
    const cases: Array<{ code: 'auth' | 'rate-limit' | 'network'; expected: string }> = [
      { code: 'auth', expected: 'provider-auth' },
      { code: 'rate-limit', expected: 'provider-rate-limit' },
      { code: 'network', expected: 'provider-network' },
    ];
    for (const { code, expected } of cases) {
      const { provider } = fakeProvider(() => Promise.reject(new ProviderError(code, 'boom')));
      setLlmProviderOverride('gemini', provider);
      const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
      const result = await engine.run(input(), doc());
      expect(result.error?.code).toBe(expected);
      expect(result.error?.message).toBe('boom');
      expect(result.proposals).toEqual([]);
      clearLlmProviderOverrides();
    }
  });

  it('surfaces malformed provider output as provider-parse errors', async () => {
    const badPayloads: Array<() => Promise<{ text: string }>> = [
      () => Promise.resolve({ text: 'not json at all' }),
      () => Promise.resolve({ text: '{"proposals":[{"targetId":"","explanation":"x","command":{"kind":"set-content","targetIds":["a"],"content":{"text":"t"}}}]}' }),
      () => Promise.resolve({ text: '{"proposals":[{"targetId":"a","explanation":"x","command":{"kind":"delete-everything"}}]}' }),
      () => Promise.resolve({ text: '{"proposals":"all of them"}' }),
    ];
    for (const respond of badPayloads) {
      const { provider } = fakeProvider(respond);
      setLlmProviderOverride('gemini', provider);
      const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
      const result = await engine.run(input(), doc());
      expect(result.error?.code).toBe('provider-parse');
      expect(result.proposals).toEqual([]);
      clearLlmProviderOverrides();
    }
  });

  it('treats an empty proposals array as a successful no-op', async () => {
    const { provider } = fakeProvider(() => Promise.resolve({ text: '{"proposals":[]}' }));
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
    const result = await engine.run(input(), doc());

    expect(result.error).toBeUndefined();
    expect(result.proposals).toEqual([]);
  });

  it('computes set-style diff sides from the live document at scope', async () => {
    const { provider } = fakeProvider(() =>
      Promise.resolve({
        text: JSON.stringify({
          proposals: [
            {
              targetId: 'hero-heading',
              explanation: 'Bump the heading size',
              command: {
                kind: 'set-style',
                targetIds: ['hero-heading'],
                stylePatch: { fontSize: 64, color: '#123456' },
              },
            },
          ],
        }),
      }),
    );
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
    const result = await engine.run(input(), doc());

    expect(result.error).toBeUndefined();
    expect(result.proposals[0].before.style).toEqual({ fontSize: 48 });
    expect(result.proposals[0].after.style).toEqual({ fontSize: 64, color: '#123456' });
  });

  it('derives the after side for insert proposals', async () => {
    const { provider } = fakeProvider(() =>
      Promise.resolve({
        text: JSON.stringify({
          proposals: [
            {
              targetId: 'cta-note',
              explanation: 'Add a note under the CTA',
              command: {
                kind: 'insert',
                parentId: 'cta-section',
                index: 0,
                element: {
                  id: 'cta-note',
                  type: 'text',
                  parentId: 'cta-section',
                  childIds: [],
                  content: { base: { text: 'Note!' } },
                },
              },
            },
          ],
        }),
      }),
    );
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
    const result = await engine.run(input(), doc());

    expect(result.error).toBeUndefined();
    expect(result.proposals[0].after.content).toEqual({ text: 'Note!' });
  });

  it('leaves sides untouched for unknown targets so validation marks them invalid', async () => {
    const { provider } = fakeProvider(() =>
      Promise.resolve({
        text: JSON.stringify({
          proposals: [
            {
              targetId: 'ghost-element',
              explanation: 'Does not exist',
              command: {
                kind: 'set-content',
                targetIds: ['ghost-element'],
                content: { text: 'boo' },
              },
            },
          ],
        }),
      }),
    );
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
    const result = await engine.run(input(), doc());

    expect(result.proposals[0].status).toBe('invalid');
    expect(result.proposals[0].before).toEqual({});
  });

  it('maps non-Error provider failures to provider-network', async () => {
    const { provider } = fakeProvider(() => Promise.reject('strings get thrown sometimes'));
    setLlmProviderOverride('gemini', provider);

    const engine = createByokEngine({ providerId: 'gemini', modelId: null, apiKey: 'key-1' });
    const result = await engine.run(input(), doc());

    expect(result.error?.code).toBe('provider-network');
    expect(typeof result.error?.message).toBe('string');
  });
});
