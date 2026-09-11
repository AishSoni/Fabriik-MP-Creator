import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { editCommandSchema, elementContentSchemas, templateDocSchema, validateCommand } from './validate';
import type { EditCommand } from '../types/commands';

const doc = () => createDefaultTemplate();

const base = { source: 'canvas' as const, scope: 'all' as const };

describe('editCommandSchema', () => {
  it('parses commands without baseRevision and rejects payloads that carry it', () => {
    const ok = editCommandSchema.safeParse({
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      stylePatch: { fontSize: 64 },
    });
    expect(ok.success).toBe(true);

    const bad = editCommandSchema.safeParse({
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      baseRevision: 0,
      stylePatch: { fontSize: 64 },
    });
    expect(bad.success).toBe(false);
  });
});

describe('validateCommand', () => {
  it('accepts a valid set-style command', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      stylePatch: { fontSize: 64 },
    });
    expect(errors).toEqual([]);
  });

  it('rejects unknown payloads', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      baseRevision: 0,
      stylePatch: { notAStyleProp: 12 },
    } as unknown as EditCommand);
    expect(errors[0]?.code).toBe('invalid-payload');
  });

  it('rejects unknown element ids', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-style',
      targetIds: ['nope'],
      stylePatch: { fontSize: 10 },
    });
    expect(errors.some((e) => e.code === 'unknown-element')).toBe(true);
  });

  it('applies commands regardless of doc revision', () => {
    const d = doc();
    d.revision = 5;
    const errors = validateCommand(d, {
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      stylePatch: { fontSize: 10 },
    });
    expect(errors).toEqual([]);
  });

  it('rejects content that does not match the element type', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-content',
      targetIds: ['hero-cta'],
      content: { text: 'hello' },
    });
    expect(errors[0]?.code).toBe('invalid-payload');
  });

  it('rejects removing the page root', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'remove',
      targetIds: ['page-root'],
    });
    expect(errors.some((e) => e.code === 'forbidden-field')).toBe(true);
  });

  it('rejects insert into non-section parent and colliding ids', () => {
    const d = doc();
    const element = JSON.parse(JSON.stringify(d.elements['footer-text']));
    const errors = validateCommand(d, {
      ...base,
      kind: 'insert',
      targetIds: [],
      parentId: 'hero-heading',
      index: 0,
      element,
    });
    expect(errors.some((e) => e.code === 'invalid-target')).toBe(true);

    const errors2 = validateCommand(d, {
      ...base,
      kind: 'insert',
      targetIds: [],
      parentId: 'features-section',
      index: 0,
      element,
    });
    expect(errors2.some((e) => e.code === 'id-collision')).toBe(true);
  });
});

describe('rename command', () => {
  const rename = (templateName: unknown): EditCommand =>
    ({ kind: 'rename', source: 'code', targetIds: [], scope: 'all', templateName }) as unknown as EditCommand;

  it('accepts a trimmed rename without touching elements', () => {
    const errors = validateCommand(doc(), rename(' Landed v2 '));
    expect(errors).toEqual([]);
  });

  it('rejects blank names', () => {
    for (const name of ['', '   ']) {
      const errors = validateCommand(doc(), rename(name));
      expect(errors.some((e) => e.code === 'invalid-payload')).toBe(true);
    }
  });

  it('rejects names beyond the length cap', () => {
    const errors = validateCommand(doc(), rename('x'.repeat(121)));
    expect(errors.some((e) => e.code === 'invalid-payload')).toBe(true);
  });

  it('rejects viewport-scoped renames', () => {
    const parsed = editCommandSchema.safeParse({
      kind: 'rename',
      source: 'code',
      targetIds: [],
      scope: 'mobile',
      templateName: 'Nope',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('document URL allowlist (spec ai-byok §8)', () => {
  const contentCmd = (content: unknown): EditCommand =>
    ({
      ...base,
      kind: 'set-content',
      targetIds: ['hero-cta'],
      content,
    }) as unknown as EditCommand;

  it('rejects javascript: href in button content', () => {
    const errors = validateCommand(doc(), contentCmd({ label: 'Click', href: 'javascript:alert(1)' }));
    expect(errors.some((e) => e.code === 'invalid-payload')).toBe(true);
  });

  it('rejects data: src in image content', () => {
    const errors = validateCommand(
      doc(),
      contentCmd({ src: 'data:image/svg+xml,<svg onload=alert(1)>', alt: 'x' }),
    );
    expect(errors.some((e) => e.code === 'invalid-payload')).toBe(true);
  });

  it('rejects javascript: href in nav link content', () => {
    const errors = validateCommand(
      doc(),
      contentCmd({ brand: 'Nav', links: [{ label: 'Evil', href: 'JAVASCRIPT:alert(1)' }] }),
    );
    expect(errors.some((e) => e.code === 'invalid-payload')).toBe(true);
  });

  it('accepts safe schemes and relative URLs', () => {
    const d = doc();
    for (const href of ['https://fabriik.dev', 'http://localhost:4173', 'mailto:hi@x.dev', 'tel:+15550001111', '/pricing', '#about']) {
      const errors = validateCommand(d, contentCmd({ label: 'Go', href }));
      expect(errors.filter((e) => e.code === 'invalid-payload')).toEqual([]);
    }
    for (const src of ['https://cdn.example.com/a.png', '/local.png', 'images/pic.jpg']) {
      expect(elementContentSchemas.image.safeParse({ src, alt: 'a' }).success).toBe(true);
    }
  });

  it('blocks unsafe URLs at the template import gate', () => {
    const evil = JSON.parse(JSON.stringify(doc())) as Record<string, unknown>;
    const elements = evil.elements as Record<string, { content: { base: Record<string, unknown> } }>;
    elements['top-nav'].content.base.links = [{ label: 'Evil', href: 'javascript:alert(1)' }];
    expect(templateDocSchema.safeParse(evil).success).toBe(false);

    const evilImage = JSON.parse(JSON.stringify(doc())) as { elements: Record<string, unknown> };
    evilImage.elements['evil-image'] = {
      id: 'evil-image',
      type: 'image',
      parentId: 'page-root',
      childIds: [],
      content: { base: { src: 'data:image/svg+xml,<svg onload=alert(1)>', alt: 'x' } },
      style: { base: {} },
    };
    expect(templateDocSchema.safeParse(evilImage).success).toBe(false);

    expect(templateDocSchema.safeParse(doc()).success).toBe(true);
  });
});
