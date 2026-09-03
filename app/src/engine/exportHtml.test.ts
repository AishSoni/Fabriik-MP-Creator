import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../template/defaultTemplate';
import type { TemplateDoc } from '../types/template';
import { TAILWIND_CDN_URL, exportHtml } from './exportHtml';

const doc = (): TemplateDoc =>
  JSON.parse(JSON.stringify(createDefaultTemplate())) as TemplateDoc;

describe('exportHtml', () => {
  it('is byte-deterministic for identical docs', () => {
    expect(exportHtml(doc())).toBe(exportHtml(doc()));
  });

  it('emits a complete document skeleton with the template name as title', () => {
    const html = exportHtml(doc());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<title>Landing Page</title>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('includes the Tailwind Play CDN script and no other external dependencies', () => {
    const html = exportHtml(doc());
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain(`<script src="${TAILWIND_CDN_URL}"></script>`);
    expect(html).not.toContain('<link');
  });

  it('escapes text and attribute content', () => {
    const d = doc();
    d.elements['hero-heading'].content.base = { text: '<script>alert(1)</script> & "quotes"' };
    const html = exportHtml(d);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;',
    );
  });

  it('rejects javascript: hrefs on buttons and nav links', () => {
    const d = doc();
    d.elements['hero-cta'].content.base = { label: 'Click', href: 'javascript:alert(1)' };
    d.elements['top-nav'].content.base = {
      brand: 'Nav',
      links: [{ label: 'Evil', href: 'JAVASCRIPT:alert(1)' }],
    };
    const html = exportHtml(d);
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('allows safe href schemes and relative targets', () => {
    const d = doc();
    d.elements['hero-cta'].content.base = {
      label: 'Mail',
      href: 'mailto:hi@example.com',
    };
    const html = exportHtml(d);
    expect(html).toContain('href="mailto:hi@example.com"');
  });

  it('maps nav elements with the same utility classes as the canvas', () => {
    const html = exportHtml(doc());
    expect(html).toContain(
      '<div class="fx-top-nav fx-nav flex items-center justify-between gap-4">',
    );
    expect(html).toContain('<span class="text-lg font-bold">Landing</span>');
    expect(html).toContain(
      '<div class="flex min-w-0 flex-wrap items-center justify-end gap-4 overflow-hidden">',
    );
    expect(html).toContain(
      '<a href="#features" class="opacity-90 hover:opacity-100">Features</a>',
    );
  });

  it('maps heading, text, list, and image elements with fx classes', () => {
    const d = doc();
    d.elements['hero-image-placeholder'] = {
      id: 'hero-image-placeholder',
      type: 'image',
      parentId: 'hero-section',
      childIds: [],
      content: { base: { src: 'https://example.com/hero.png', alt: 'Hero' } },
      style: { base: { widthPercent: 60 } },
    };
    d.elements['hero-section'].childIds.push('hero-image-placeholder');
    d.elements['feature-list'] = {
      id: 'feature-list',
      type: 'list',
      parentId: 'features-section',
      childIds: [],
      content: { base: { items: ['Modular elements', 'Scoped AI proposals'] } },
      style: { base: {} },
    };
    d.elements['features-section'].childIds.push('feature-list');
    const html = exportHtml(d);
    expect(html).toContain(
      '<h2 class="fx-hero-heading fx-heading">Main Hero Message to Sell Yourself!</h2>',
    );
    expect(html).toContain(
      '<img class="fx-hero-image-placeholder fx-image" src="https://example.com/hero.png" alt="Hero">',
    );
    expect(html).toContain('<ul class="fx-feature-list fx-list">');
    expect(html).toContain('<li>Modular elements</li>');
    expect(html).toContain('<li>Scoped AI proposals</li>');
  });

  it('renders button wrappers with flex layout derived from textAlign', () => {
    const d = doc();
    d.elements['hero-cta'].style.base.textAlign = 'center';
    const html = exportHtml(d);
    expect(html).toContain('.fx-hero-cta {');
    expect(html).toContain('display: flex;');
    expect(html).toContain('justify-content: center;');
  });

  it('places tablet overrides in a max-width 1023px media block with full resolved styles', () => {
    const html = exportHtml(doc());
    const tabletBlock = html.split('/* Tablet */')[1]?.split('/* Mobile */')[0] ?? '';
    expect(tabletBlock).toContain('@media (max-width: 1023px)');
    expect(tabletBlock).toContain('.fx-hero-heading {');
    expect(tabletBlock).toContain('font-size: 40px;');
    expect(tabletBlock).toContain('text-align: center;');
    expect(tabletBlock).toContain('margin-bottom: 16px;');
  });

  it('places mobile overrides in a max-width 767px block emitted after the tablet block', () => {
    const html = exportHtml(doc());
    const tabletIndex = html.indexOf('/* Tablet */');
    const mobileIndex = html.indexOf('/* Mobile */');
    expect(tabletIndex).toBeGreaterThan(-1);
    expect(mobileIndex).toBeGreaterThan(tabletIndex);
    const mobileBlock = html.split('/* Mobile */')[1] ?? '';
    expect(mobileBlock).toContain('@media (max-width: 767px)');
    expect(mobileBlock).toContain('.fx-top-nav {');
    expect(mobileBlock).toContain('padding-left: 16px;');
    expect(mobileBlock).toContain('padding-right: 16px;');
    expect(mobileBlock).toContain('background-color: #4f46e5;');
    expect(mobileBlock).toContain('padding-top: 16px;');
  });

  it('emits exactly one base rule per styled element and no media rule without overrides', () => {
    const html = exportHtml(doc());
    expect(html.match(/fx-page-root/g)).toHaveLength(2);
    const styleBlock = html.slice(html.indexOf('/* Element styles */'), html.indexOf('</style>'));
    const mediaBlocks = styleBlock.slice(styleBlock.indexOf('/* Tablet */'));
    expect(mediaBlocks).not.toContain('fx-page-root');
    expect(styleBlock.match(/\.fx-page-root \{/g)).toHaveLength(1);
  });

  it('deduplicates sanitized class names', () => {
    const d = doc();
    d.elements['Hero?'] = {
      id: 'Hero?',
      type: 'text',
      parentId: 'page-root',
      childIds: [],
      content: { base: { text: 'one' } },
      style: { base: {} },
    };
    d.elements['page-root'].childIds.push('Hero?');
    d.elements['HERO'] = {
      id: 'HERO',
      type: 'text',
      parentId: 'page-root',
      childIds: [],
      content: { base: { text: 'two' } },
      style: { base: {} },
    };
    d.elements['page-root'].childIds.push('HERO');
    const html = exportHtml(d);
    expect(html).toContain('fx-hero ');
    expect(html).toContain('fx-hero-2');
  });

  it('snapshots the default template export', () => {
    expect(exportHtml(doc())).toMatchSnapshot();
  });
});
