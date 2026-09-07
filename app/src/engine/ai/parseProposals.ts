import type { ElementContent, ElementId, TemplateElement } from '../../types/template';
import { defaultContentFor } from '../../types/template';
import type { Scope } from '../../types/viewport';
import type { RawProposal } from './buildProposals';
import { aiOutputSchema, proposalSideSchema, type AiCommand } from './outputSchema';

export class ProposalParseError extends Error {
  readonly code = 'provider-parse' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ProposalParseError';
  }
}

export function parseProposals(text: string, scope: Scope): RawProposal[] {
  let json: unknown;
  try {
    json = parseProviderJson(text);
  } catch (error) {
    if (error instanceof ProposalParseError) throw error;
    throw new ProposalParseError('Provider response was not valid JSON');
  }

  const parsed = aiOutputSchema.safeParse(tolerateProposalShape(json));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : parsed.error.message;
    throw new ProposalParseError(`Provider response failed the proposals schema (${detail})`);
  }

  return parsed.data.proposals.map((proposal) => ({
    targetId: proposal.targetId as ElementId,
    explanation: proposal.explanation,
    before: proposal.before ?? {},
    after: proposal.after ?? {},
    command: toCommand(proposal.command, scope),
  }));
}

const KNOWN_PROPOSAL_KEYS = ['targetId', 'explanation', 'before', 'after', 'command'] as const;

/**
 * Models routinely decorate proposals with extra keys or send before/after
 * sides as bare content (`{text}`) instead of the `{content, style}` envelope.
 * Both are cosmetic: the engine rebuilds sides from the live document for every
 * mutation kind, so a malformed side is dropped rather than failing the whole
 * response. Semantically required fields (targetId, explanation, command) are
 * left for the strict schema to enforce.
 */
function tolerateProposalShape(output: unknown): unknown {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const { proposals } = output as { proposals?: unknown };
  if (!Array.isArray(proposals)) return output;
  return {
    ...output,
    proposals: proposals.map((proposal) => {
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return proposal;
      const record = proposal as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      for (const key of KNOWN_PROPOSAL_KEYS) {
        if (!(key in record)) continue;
        if ((key === 'before' || key === 'after') && !proposalSideSchema.safeParse(record[key]).success) {
          continue;
        }
        normalized[key] = record[key];
      }
      return normalized;
    }),
  };
}

function parseProviderJson(text: string): unknown {
  const candidates = [text.trim(), extractFencedJson(text), extractOuterObject(text)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  throw new ProposalParseError('Provider response was not valid JSON');
}

function extractFencedJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? (match[1] ?? '').trim() : '';
}

function extractOuterObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : '';
}

function toCommand(command: AiCommand, scope: Scope): RawProposal['command'] {
  switch (command.kind) {
    case 'set-content':
      return {
        kind: 'set-content',
        source: 'ai',
        targetIds: [command.targetIds[0] as ElementId] as [ElementId],
        scope,
        content: command.content,
      };
    case 'set-style':
      return {
        kind: 'set-style',
        source: 'ai',
        targetIds: command.targetIds,
        scope,
        stylePatch: command.stylePatch,
      };
    case 'reorder':
      return {
        kind: 'reorder',
        source: 'ai',
        targetIds: [command.targetIds[0] as ElementId] as [ElementId],
        scope,
        index: command.index,
      };
    case 'insert':
      return {
        kind: 'insert',
        source: 'ai',
        targetIds: [],
        scope,
        parentId: command.parentId,
        index: command.index,
        element: normalizeInsertedElement(command.element as unknown as TemplateElement),
      };
    case 'remove':
      return {
        kind: 'remove',
        source: 'ai',
        targetIds: command.targetIds,
        scope,
      };
  }
}

function normalizeInsertedElement(element: TemplateElement): TemplateElement {
  const raw = element as TemplateElement & { content?: { base?: ElementContent; overrides?: TemplateElement['content']['overrides'] } };
  return {
    ...element,
    content: {
      base: raw.content?.base ?? defaultContentFor(element.type),
      overrides: raw.content?.overrides,
    },
  };
}
