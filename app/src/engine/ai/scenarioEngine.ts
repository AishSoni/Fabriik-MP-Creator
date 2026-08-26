import type { DemoError, DemoInput, DemoResult, Proposal } from '../../types/proposal';
import type { ElementContent, ElementId, StylePatch, TemplateDoc } from '../../types/template';
import type { Scope } from '../../types/viewport';
import { buildProposals, darkenHex, lightenHex, resolvedForScope, type EngineContext, type RawProposal } from './buildProposals';

const CONTENT_RE = /\b(rewrite|reword|rephrase|headline|title|text|wording|shorten|shorter|exciting|punchier|friendlier)\b/i;
const STYLE_RE = /\b(color|colour|darker|lighter|bold(?:er)?|bigger|larger|smaller|background)\b/i;
const RESIZE_RE = /\b(move up|move down|wider|narrower|resize)\b/i;
const MULTI_RE = /\b(all|every|both)\b/i;

export const EXAMPLE_INSTRUCTIONS: { instruction: string; description: string }[] = [
  { instruction: 'Rewrite the text to be more exciting', description: 'Content rewrite' },
  { instruction: 'Make the background darker and the font bigger', description: 'Style change' },
  { instruction: 'Move this element up', description: 'Reorder' },
  { instruction: 'Make this wider', description: 'Resize' },
  { instruction: 'On mobile make the font smaller', description: 'One-viewport responsive adjustment' },
  { instruction: 'Make all selected elements bolder', description: 'Multi-element edit' },
  { instruction: 'Change the templateId to something else', description: 'Safe failure: forbidden field' },
  { instruction: 'Now change the footer section too', description: 'Safe failure: unselected target' },
  { instruction: 'Simulate a stale revision conflict', description: 'Safe failure: stale revision' },
  { instruction: 'Tell me a joke about pixels', description: 'Safe failure: unsupported instruction' },
];

export function runDemoEngine(input: DemoInput, doc: TemplateDoc): DemoResult {
  const instruction = input.instruction.trim();
  const ctx: EngineContext = { doc, selectedIds: input.selectedIds, scope: input.scope };

  if (input.selectedIds.length === 0) {
    return fail(input, 'unselected-target', 'Nothing is selected. Select one or more elements before requesting an AI demo edit.');
  }

  if (/simulate a stale revision|stale conflict/i.test(instruction)) {
    const proposals = buildStaleProposals(ctx);
    return { input, proposals };
  }

  if (/\btemplate\s*id\b|\btemplateid\b|\btemplate id field\b/i.test(instruction) && !/\bstale\b/i.test(instruction)) {
    return fail(
      input,
      'forbidden-field',
      'The instruction targets protected fields (templateId). These are outside the allowed editable property set.',
    );
  }

  const mentioned = findUnselectedMentions(doc, input.selectedIds, instruction);
  if (mentioned.length > 0) {
    return fail(
      input,
      'unselected-target',
      `The instruction references elements that are not in the selection: ${mentioned.join(', ')}. Select them first.`,
    );
  }

  const namedScope = extractNamedViewport(instruction);
  const scope: Scope = namedScope ?? input.scope;
  const scopedCtx: EngineContext = { ...ctx, scope };

  const raws: RawProposal[] = [];

  if (CONTENT_RE.test(instruction)) {
    for (const id of targetsFor(scopedCtx, instruction)) {
      const raw = rewriteProposal(scopedCtx, id, instruction);
      if (raw) raws.push(raw);
    }
  }

  if (raws.length === 0 && STYLE_RE.test(instruction)) {
    for (const id of targetsFor(scopedCtx, instruction)) {
      raws.push(...styleProposals(scopedCtx, id, instruction));
    }
  }

  if (raws.length === 0 && RESIZE_RE.test(instruction)) {
    for (const id of targetsFor(scopedCtx, instruction)) {
      const raw = resizeProposal(scopedCtx, id, instruction);
      if (raw) raws.push(raw);
    }
  }

  if (raws.length === 0) {
    return fail(
      input,
      'unsupported-instruction',
      `"${instruction}" does not match any supported demo path. Try one of the documented example instructions below.`,
    );
  }

  const proposals = buildProposals(scopedCtx, raws);
  return { input, proposals };
}

function fail(input: DemoInput, code: DemoError['code'], message: string): DemoResult {
  return { input, proposals: [], error: { code, message } };
}

function targetsFor(ctx: EngineContext, instruction: string): ElementId[] {
  if (ctx.selectedIds.length > 1 && MULTI_RE.test(instruction)) return ctx.selectedIds;
  if (/\bthis\b|\bit\b|\bthese\b/i.test(instruction) || !MULTI_RE.test(instruction)) {
    return ctx.selectedIds.slice(0, 1);
  }
  return ctx.selectedIds;
}

function extractNamedViewport(instruction: string): Scope | null {
  if (/\bon mobile\b|\bfor mobile\b|\bmobile only\b/i.test(instruction)) return 'mobile';
  if (/\bon tablet\b|\bfor tablet\b|\btablet only\b/i.test(instruction)) return 'tablet';
  if (/\bon desktop\b|\bfor desktop\b|\bdesktop only\b/i.test(instruction)) return 'desktop';
  return null;
}

function findUnselectedMentions(doc: TemplateDoc, selectedIds: ElementId[], instruction: string): ElementId[] {
  const words = new Set(instruction.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
  const mentioned: ElementId[] = [];
  for (const id of Object.keys(doc.elements)) {
    if (selectedIds.includes(id) || id === doc.rootId) continue;
    const tokens = id.toLowerCase().split('-').filter((t) => t.length > 2);
    if (tokens.length >= 2 && tokens.every((token) => words.has(token))) {
      mentioned.push(id);
    }
  }
  return mentioned;
}

function rewriteProposal(ctx: EngineContext, id: ElementId, instruction: string): RawProposal | null {
  const resolved = resolvedForScope(ctx, id);
  const content = resolved.content as { text?: string; label?: string };
  const current = content.text ?? content.label;
  if (current === undefined) return null;
  let next: string;
  if (/shorten|shorter/i.test(instruction)) next = `${current.split(/\s+/).slice(0, 5).join(' ')}…`;
  else next = toTitleCase(current);

  const command =
    content.text !== undefined
      ? { kind: 'set-content' as const, source: 'ai' as const, targetIds: [id] as [ElementId], scope: ctx.scope, content: { text: next } }
      : { kind: 'set-content' as const, source: 'ai' as const, targetIds: [id] as [ElementId], scope: ctx.scope, content: { label: next, href: (resolved.content as { href: string }).href } };

  return {
    targetId: id,
    explanation: `Deterministic rewrite: converts the current ${content.text !== undefined ? 'text' : 'button label'} to title case using its live value.`,
    before: { content: resolved.content },
    after: { content: command.content as ElementContent },
    command,
  };
}

function styleProposals(ctx: EngineContext, id: ElementId, instruction: string): RawProposal[] {
  const resolved = resolvedForScope(ctx, id);
  const patch: StylePatch = {};
  const notes: string[] = [];

  if (/bigger|larger/.test(instruction.toLowerCase()) && resolved.style.fontSize !== undefined) {
    patch.fontSize = Math.round(resolved.style.fontSize * 1.25);
    notes.push(`fontSize ${resolved.style.fontSize} → ${patch.fontSize}`);
  }
  if (/smaller/.test(instruction.toLowerCase()) && resolved.style.fontSize !== undefined) {
    patch.fontSize = Math.max(10, Math.floor(resolved.style.fontSize * 0.8));
    notes.push(`fontSize ${resolved.style.fontSize} → ${patch.fontSize}`);
  }
  if (/bold(er)?/.test(instruction.toLowerCase())) {
    patch.fontWeight = 800;
    notes.push('fontWeight → 800');
  }
  if (/darker|lighter/.test(instruction.toLowerCase())) {
    if (/background/.test(instruction.toLowerCase()) && resolved.style.backgroundColor) {
      patch.backgroundColor = /darker/i.test(instruction)
        ? darkenHex(resolved.style.backgroundColor)
        : lightenHex(resolved.style.backgroundColor);
      notes.push(`backgroundColor → ${patch.backgroundColor}`);
    } else if (resolved.style.color) {
      patch.color = /darker/i.test(instruction) ? darkenHex(resolved.style.color) : lightenHex(resolved.style.color);
      notes.push(`color → ${patch.color}`);
    }
  } else if (/background/.test(instruction.toLowerCase()) && resolved.style.backgroundColor) {
    patch.backgroundColor = darkenHex(resolved.style.backgroundColor, 0.92);
    notes.push(`backgroundColor → ${patch.backgroundColor}`);
  }

  if (Object.keys(patch).length === 0) return [];

  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) picked[key] = (resolved.style as Record<string, unknown>)[key];

  return [
    {
      targetId: id,
      explanation: `Deterministic style change (${notes.join('; ')}) computed from the live resolved value at scope "${ctx.scope}".`,
      before: { style: picked as StylePatch },
      after: { style: patch },
      command: {
        kind: 'set-style',
        source: 'ai',
        targetIds: [id],
        scope: ctx.scope,
        stylePatch: patch,
      },
    },
  ];
}

function resizeProposal(ctx: EngineContext, id: ElementId, instruction: string): RawProposal | null {
  const lower = instruction.toLowerCase();
  const element = ctx.doc.elements[id];
  const parent = element.parentId ? ctx.doc.elements[element.parentId] : undefined;

  if (/move up|move down/.test(lower) && parent) {
    const siblings = parent.childIds;
    const index = siblings.indexOf(id);
    const delta = /move up/.test(lower) ? -1 : 1;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= siblings.length) return null;
    return {
      targetId: id,
      explanation: `Deterministic reorder: position ${index} → ${targetIndex} within "${parent.id}".`,
      before: {},
      after: {},
      command: {
        kind: 'reorder',
        source: 'ai',
        targetIds: [id],
        scope: ctx.scope,
        index: targetIndex,
      },
    };
  }

  const resolved = resolvedForScope(ctx, id);
  if (/wider|narrower/.test(lower) && resolved.style.widthPercent !== undefined) {
    const width = Math.max(10, Math.min(100, resolved.style.widthPercent + (/wider/.test(lower) ? 10 : -10)));
    const picked = { widthPercent: resolved.style.widthPercent };
    return {
      targetId: id,
      explanation: `Deterministic resize: widthPercent ${resolved.style.widthPercent} → ${width}.`,
      before: { style: picked },
      after: { style: { widthPercent: width } },
      command: {
        kind: 'set-style',
        source: 'ai',
        targetIds: [id],
        scope: ctx.scope,
        stylePatch: { widthPercent: width },
      },
    };
  }
  return null;
}

function buildStaleProposals(ctx: EngineContext): Proposal[] {
  const raws: RawProposal[] = [];
  for (const id of ctx.selectedIds.slice(0, 1)) {
    const resolved = resolvedForScope(ctx, id);
    const content = resolved.content as { text?: string };
    if (content.text === undefined) continue;
    raws.push({
      targetId: id,
      explanation: 'Simulated stale proposal: its baseRevision intentionally lags the document so acceptance must be rejected.',
      before: { content: resolved.content },
      after: { content: { text: 'This change should never apply.' } },
      command: {
        kind: 'set-content',
        source: 'ai',
        targetIds: [id],
        scope: ctx.scope,
        content: { text: 'This change should never apply.' },
      },
    });
  }
  const proposals = buildProposals(ctx, raws);
  return proposals.map((p) => ({
    ...p,
    status: 'invalid',
    invalidReason: `stale-revision: proposal was built against revision ${ctx.doc.revision - 1}, but the template is now at revision ${ctx.doc.revision}`,
    command: { ...p.command, baseRevision: ctx.doc.revision - 1 },
  }));
}

function toTitleCase(text: string): string {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
