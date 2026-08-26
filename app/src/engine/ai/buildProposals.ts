import type { EditCommand } from '../../types/commands';
import type { ElementContent, ElementId, StylePatch, TemplateDoc } from '../../types/template';
import type { Scope } from '../../types/viewport';
import { resolveElement } from '../resolve';
import { validateCommand } from '../validate';

export interface RawProposal {
  targetId: ElementId;
  explanation: string;
  before: { content?: ElementContent; style?: StylePatch };
  after: { content?: ElementContent; style?: StylePatch };
  command: DistributiveOmit<EditCommand, 'baseRevision'>;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface EngineContext {
  doc: TemplateDoc;
  selectedIds: ElementId[];
  scope: Scope;
}

export function buildProposals(ctx: EngineContext, raws: RawProposal[]): import('../../types/proposal').Proposal[] {
  const baseRevision = ctx.doc.revision;
  const ordered = orderTargets(ctx.doc, raws.map((r) => r.targetId));
  return raws
    .map((raw) => ({ raw, seq: ordered.indexOf(raw.targetId) }))
    .sort((a, b) => a.seq - b.seq)
    .map(({ raw }, index) => {
      const command = { ...raw.command, baseRevision } as EditCommand & { source: 'ai' };
      const errors = validateCommand(ctx.doc, command);
      return {
        proposalId: `p-${baseRevision}-${raw.targetId}-${index}`,
        targetId: raw.targetId,
        status: errors.length > 0 ? 'invalid' : 'pending',
        explanation: raw.explanation,
        before: raw.before,
        after: raw.after,
        invalidReason: errors[0]?.message,
        generatedAt: baseRevision,
        command,
      };
    });
}

export function orderTargets(doc: TemplateDoc, ids: ElementId[]): ElementId[] {
  const depth = new Map<ElementId, number>();
  const walk = (id: ElementId, d: number) => {
    const existing = depth.get(id);
    if (existing !== undefined && existing <= d) return;
    depth.set(id, d);
    const element = doc.elements[id];
    if (!element) return;
    for (const child of element.childIds) walk(child, d + 1);
  };
  walk(doc.rootId, 0);
  const indexOf = (id: ElementId) => {
    let d = depth.get(id);
    if (d === undefined) {
      walk(id, 0);
      d = depth.get(id);
    }
    return d ?? Number.MAX_SAFE_INTEGER;
  };
  return [...ids].sort((a, b) => indexOf(a) - indexOf(b) || a.localeCompare(b));
}

export function resolvedForScope(
  ctx: EngineContext,
  targetId: ElementId,
): ReturnType<typeof resolveElement> {
  const vp = ctx.scope === 'all' ? 'desktop' : ctx.scope;
  return resolveElement(ctx.doc.elements[targetId], vp);
}

export function darkenHex(hex: string, factor = 0.85): string {
  return shadeHex(hex, factor);
}

export function lightenHex(hex: string, factor = 1.18): string {
  return shadeHex(hex, factor);
}

function shadeHex(hex: string, factor: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const value = match[1];
  const channels = [0, 2, 4].map((i) =>
    Math.max(0, Math.min(255, Math.round(parseInt(value.slice(i, i + 2), 16) * factor))),
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
