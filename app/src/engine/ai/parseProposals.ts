import type { ElementContent, ElementId, TemplateElement } from '../../types/template';
import { defaultContentFor } from '../../types/template';
import type { Scope } from '../../types/viewport';
import type { RawProposal } from './buildProposals';
import { aiOutputSchema, type AiCommand } from './outputSchema';

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
    json = JSON.parse(text);
  } catch {
    throw new ProposalParseError('Provider response was not valid JSON');
  }

  const parsed = aiOutputSchema.safeParse(json);
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
