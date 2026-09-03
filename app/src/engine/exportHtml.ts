import type { StyleProps, TemplateDoc } from '../types/template';
import { getSubtreeIds, resolveElement, type ResolvedElement } from './resolve';
import { styleToCssText } from './styleToCssText';

export const TAILWIND_CDN_URL = 'https://cdn.tailwindcss.com';

const TABLET_MAX_WIDTH = 1023;
const MOBILE_MAX_WIDTH = 767;

export function exportHtml(doc: TemplateDoc): string {
  const classMap = buildClassMap(doc);
  const bodyLines = renderElement(doc, doc.rootId, classMap, 1);
  const css = buildCss(doc, classMap)
    .split('\n')
    .map((line) => (line.length > 0 ? `    ${line}` : line))
    .join('\n');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    `    <title>${escapeHtml(doc.templateName)}</title>`,
    `    <script src="${TAILWIND_CDN_URL}"></script>`,
    '    <style>',
    css,
    '    </style>',
    '  </head>',
    '  <body>',
    ...bodyLines,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function buildClassMap(doc: TemplateDoc): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const id of Object.keys(doc.elements)) {
    const base = sanitizeClassToken(id);
    const candidate = base === '' || /^[0-9]/.test(base) ? `el-${base}` : base;
    let name = candidate;
    let suffix = 2;
    while (used.has(name)) {
      name = `${candidate}-${suffix}`;
      suffix += 1;
    }
    used.add(name);
    map.set(id, `fx-${name}`);
  }
  return map;
}

function sanitizeClassToken(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildCss(doc: TemplateDoc, classMap: Map<string, string>): string {
  const baseRules: string[] = [];
  const tabletRules: string[] = [];
  const mobileRules: string[] = [];

  for (const id of getSubtreeIds(doc, doc.rootId)) {
    const element = doc.elements[id];
    if (!element) continue;
    const selector = `.${classMap.get(id)}`;
    const baseDeclarations = elementDeclarations(resolveElement(element, 'desktop'));
    if (baseDeclarations.length > 0) {
      baseRules.push(formatRule(selector, baseDeclarations, 0));
    }
    if (element.style.overrides?.tablet) {
      const declarations = elementDeclarations(resolveElement(element, 'tablet'));
      if (declarations.length > 0) {
        tabletRules.push(formatRule(selector, declarations, 2));
      }
    }
    if (element.style.overrides?.mobile) {
      const declarations = elementDeclarations(resolveElement(element, 'mobile'));
      if (declarations.length > 0) {
        mobileRules.push(formatRule(selector, declarations, 2));
      }
    }
  }

  const blocks: string[] = [`/* Element styles */\n${baseRules.join('\n\n')}`];
  if (tabletRules.length > 0) {
    blocks.push(
      `/* Tablet */\n@media (max-width: ${TABLET_MAX_WIDTH}px) {\n${tabletRules.join('\n\n')}\n}`,
    );
  }
  if (mobileRules.length > 0) {
    blocks.push(
      `/* Mobile */\n@media (max-width: ${MOBILE_MAX_WIDTH}px) {\n${mobileRules.join('\n\n')}\n}`,
    );
  }
  return blocks.join('\n\n');
}

function formatRule(selector: string, declarations: string[], indentLevel: number): string {
  const pad = '  '.repeat(indentLevel);
  const body = declarations.map((d) => `${pad}  ${d};`).join('\n');
  return `${pad}${selector} {\n${body}\n${pad}}`;
}

function elementDeclarations(resolved: ResolvedElement): string[] {
  const declarations = styleToCssText(resolved.style);
  if (resolved.type === 'button') {
    declarations.push('display: flex');
    declarations.push(`justify-content: ${justifyContentFor(resolved.style.textAlign)}`);
  }
  return declarations;
}

function justifyContentFor(textAlign: StyleProps['textAlign']): string {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'flex-end';
  return 'flex-start';
}

function renderElement(
  doc: TemplateDoc,
  id: string,
  classMap: Map<string, string>,
  level: number,
): string[] {
  const element = doc.elements[id];
  if (!element) return [];
  const pad = '  '.repeat(level);
  const className = `${classMap.get(id)} fx-${element.type}`;
  const resolved = resolveElement(element, 'desktop');
  const content = resolved.content as Record<string, unknown>;

  switch (element.type) {
    case 'section': {
      const children = element.childIds.flatMap((childId) =>
        renderElement(doc, childId, classMap, level + 1),
      );
      return [`${pad}<div class="${className}">`, ...children, `${pad}</div>`];
    }
    case 'nav': {
      const brand = escapeHtml(String(content.brand ?? ''));
      const links = Array.isArray(content.links) ? content.links : [];
      const linkLines = links.map(
        (link) =>
          `${pad}      <a href="${escapeHtml(safeHref(String(link?.href ?? '')))}" class="opacity-90 hover:opacity-100">${escapeHtml(String(link?.label ?? ''))}</a>`,
      );
      return [
        `${pad}<nav>`,
        `${pad}  <div class="${className} flex items-center justify-between gap-4">`,
        `${pad}    <span class="text-lg font-bold">${brand}</span>`,
        `${pad}    <div class="flex min-w-0 flex-wrap items-center justify-end gap-4 overflow-hidden">`,
        ...linkLines,
        `${pad}    </div>`,
        `${pad}  </div>`,
        `${pad}</nav>`,
      ];
    }
    case 'heading':
      return [`${pad}<h2 class="${className}">${escapeHtml(String(content.text ?? ''))}</h2>`];
    case 'text':
      return [`${pad}<p class="${className}">${escapeHtml(String(content.text ?? ''))}</p>`];
    case 'button':
      return [
        `${pad}<div class="${className}">`,
        `${pad}  <a href="${escapeHtml(safeHref(String(content.href ?? '')))}" class="inline-block cursor-pointer no-underline">${escapeHtml(String(content.label ?? ''))}</a>`,
        `${pad}</div>`,
      ];
    case 'image':
      return [
        `${pad}<img class="${className}" src="${escapeHtml(safeSrc(String(content.src ?? '')))}" alt="${escapeHtml(String(content.alt ?? ''))}">`,
      ];
    case 'list': {
      const items = Array.isArray(content.items) ? content.items : [];
      const itemLines = items.map((item) => `${pad}  <li>${escapeHtml(String(item))}</li>`);
      return [`${pad}<ul class="${className}">`, ...itemLines, `${pad}</ul>`];
    }
    default:
      return [];
  }
}

const SAFE_HREF_SCHEME = /^(?:https?|mailto|tel):/i;

export function safeHref(href: string): string {
  const trimmed = href.trim();
  if (trimmed === '') return '#';
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (schemeMatch && !SAFE_HREF_SCHEME.test(trimmed)) return '#';
  return trimmed;
}

function safeSrc(src: string): string {
  return safeHref(src);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
