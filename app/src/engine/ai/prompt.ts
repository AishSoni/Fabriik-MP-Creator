import type { DemoInput } from '../../types/proposal';
import type { ElementType, TemplateDoc } from '../../types/template';
import { STYLE_PROPS } from '../../types/template';
import { elementContentSchemas } from '../validate';
import { resolvedForScope, type EngineContext } from './buildProposals';

const URL_RULE = 'URLs (href/src) must use https:, http:, mailto:, tel:, or be relative (for example "#pricing"). Never javascript:, data:, or any other scheme.';

function contentKeysLine(type: ElementType): string {
  const keys = Object.keys(elementContentSchemas[type].shape);
  return keys.length > 0 ? keys.join(', ') : '(no content keys — use {})';
}

export function buildSystemPrompt(): string {
  const styleProps = [...STYLE_PROPS].join(', ');
  const contentRules = (Object.keys(elementContentSchemas) as ElementType[])
    .map((type) => `- ${type}: ${contentKeysLine(type)}`)
    .join('\n');

  return [
    'You are Fabriik\'s website editing assistant. Reply with JSON only — no markdown, no prose.',
    'Output shape: {"proposals": [...]} — an array of proposal objects.',
    'Each proposal: {"targetId": "<element id>", "explanation": "<one short sentence>", "before": {...}, "after": {...}, "command": {...}}. "before"/"after" mirror the affected content and/or style values.',
    '',
    'Commands (exact fields; exactly one "kind" each):',
    '- set-content: {"kind":"set-content","targetIds":["<id>"],"content":{...}} — targetIds holds exactly one id.',
    '- set-style: {"kind":"set-style","targetIds":["<id>", ...],"stylePatch":{...}}',
    '- reorder: {"kind":"reorder","targetIds":["<id>"],"index":<new position within the parent\'s childIds>}',
    '- insert: {"kind":"insert","parentId":"<section id>","index":<number>,"element":{"id":"<unique kebab-case id>","type":"...","parentId":"<same section id>","childIds":[],"content":{"base":{...}},"style":{"base":{...}}}}',
    '- remove: {"kind":"remove","targetIds":["<id>", ...]}',
    '',
    'Never include "source" or "scope" in a command — the app injects them.',
    'targetId and command targetIds must be element ids taken from the provided document inventory. Keep proposals minimal and independent; do not emit more than the instruction needs.',
    '',
    `Style rules: stylePatch accepts only these props: ${styleProps}.`,
    'color and backgroundColor must be hex colors (#rgb, #rgba, or #rrggbb). textAlign is one of left, center, right. All other values are plain numbers without units.',
    '',
    'Content rules — content keys must exactly match the element type:',
    contentRules,
    '',
    URL_RULE,
    'Use the before/after values to describe the smallest change that satisfies the instruction.',
  ].join('\n');
}

export function buildUserPrompt(input: DemoInput, doc: TemplateDoc): string {
  const ctx: EngineContext = { doc, selectedIds: input.selectedIds, scope: input.scope };
  const lines: string[] = [];

  lines.push(`Instruction: ${input.instruction}`);
  lines.push(`Scope: ${input.scope}`);
  lines.push('');
  lines.push('Selected elements (preferred targets):');
  for (const id of input.selectedIds) {
    const element = doc.elements[id];
    if (!element) continue;
    const resolved = resolvedForScope(ctx, id);
    lines.push(`- ${element.id} (${element.type})`);
    lines.push(`  content: ${JSON.stringify(resolved.content)}`);
    lines.push(`  style: ${JSON.stringify(resolved.style)}`);
  }

  lines.push('');
  lines.push('Document inventory:');
  for (const element of Object.values(doc.elements)) {
    const parent = element.parentId ?? 'none';
    lines.push(`- ${element.id} (${element.type}, parent: ${parent})`);
  }

  lines.push('');
  lines.push('Respond with JSON only.');
  return lines.join('\n');
}
