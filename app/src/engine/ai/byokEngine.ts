import type { DemoError, DemoErrorCode, DemoInput, DemoResult } from '../../types/proposal';
import type { StylePatch, TemplateDoc } from '../../types/template';
import { buildProposals, resolvedForScope } from './buildProposals';
import type { EngineContext, RawProposal } from './buildProposals';
import { AI_OUTPUT_JSON_SCHEMA } from './outputSchema';
import { parseProposals, ProposalParseError } from './parseProposals';
import type { ProposalEngine } from './proposalEngine';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { createLlmProvider } from './providers';
import type { ProviderId, ProviderErrorCode } from './providers/types';
import { ProviderError } from './providers/types';

export interface ByokEngineOptions {
  providerId: string;
  modelId: string | null;
  apiKey: string | null;
}

const DEMO_CODE_BY_PROVIDER: Record<ProviderErrorCode, DemoErrorCode> = {
  auth: 'provider-auth',
  'rate-limit': 'provider-rate-limit',
  network: 'provider-network',
};

function errorResult(input: DemoInput, code: DemoErrorCode, message: string): DemoResult {
  const error: DemoError = { code, message };
  return { input, proposals: [], error };
}

function withResolvedSides(ctx: EngineContext, raws: RawProposal[]): RawProposal[] {
  return raws.map((raw) => {
    const command = raw.command;
    if (command.kind === 'set-content' || command.kind === 'set-style') {
      const targetId = command.targetIds[0];
      if (!ctx.doc.elements[targetId]) return raw;
      const resolved = resolvedForScope(ctx, targetId);
      if (command.kind === 'set-content') {
        return {
          ...raw,
          before: { content: resolved.content },
          after: { content: command.content },
        };
      }
      const picked: Record<string, string | number> = {};
      for (const prop of Object.keys(command.stylePatch) as Array<keyof StylePatch>) {
        const value = resolved.style[prop];
        if (value !== undefined) picked[prop] = value;
      }
      return {
        ...raw,
        before: { style: picked as StylePatch },
        after: { style: command.stylePatch },
      };
    }
    if (command.kind === 'insert') {
      return { ...raw, after: { content: command.element.content.base } };
    }
    return raw;
  });
}

export function createByokEngine(options: ByokEngineOptions): ProposalEngine {
  return {
    id: 'byok',
    label: 'BYOK',
    async run(input: DemoInput, doc: TemplateDoc): Promise<DemoResult> {
      let provider;
      try {
        provider = createLlmProvider(options.providerId as ProviderId);
      } catch {
        return errorResult(input, 'provider-network', `Unknown provider "${options.providerId}".`);
      }

      if (!options.apiKey) {
        return errorResult(input, 'provider-auth', 'No API key set for this provider. Add one in AI settings.');
      }

      const ctx: EngineContext = { doc, selectedIds: input.selectedIds, scope: input.scope };
      try {
        const { text } = await provider.complete({
          model: options.modelId ?? provider.defaultModel,
          apiKey: options.apiKey,
          system: buildSystemPrompt(),
          user: buildUserPrompt(input, doc),
          schema: AI_OUTPUT_JSON_SCHEMA,
        });
        const raws = withResolvedSides(ctx, parseProposals(text, input.scope));
        const proposals = buildProposals(ctx, raws);
        return { input, proposals };
      } catch (error) {
        if (error instanceof ProposalParseError) {
          return errorResult(input, 'provider-parse', error.message);
        }
        if (error instanceof ProviderError) {
          return errorResult(input, DEMO_CODE_BY_PROVIDER[error.code], error.message);
        }
        return errorResult(input, 'provider-network', error instanceof Error ? error.message : 'Provider request failed.');
      }
    },
  };
}
