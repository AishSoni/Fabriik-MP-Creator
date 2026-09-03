import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../template/defaultTemplate';
import type { TemplateDoc } from '../types/template';
import {
  TEMPLATE_FILE_FORMAT,
  TEMPLATE_FILE_VERSION,
  exportTemplateJson,
  parseTemplateJson,
} from './exportTemplate';

const doc = (): TemplateDoc => createDefaultTemplate();

const fixedNow = new Date('2026-01-15T10:30:00.000Z');

describe('exportTemplateJson', () => {
  it('wraps the doc in a versioned envelope with the injected timestamp', () => {
    const text = exportTemplateJson(doc(), fixedNow);
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(TEMPLATE_FILE_FORMAT);
    expect(parsed.version).toBe(TEMPLATE_FILE_VERSION);
    expect(parsed.exportedAt).toBe('2026-01-15T10:30:00.000Z');
    expect(parsed.doc).toEqual(doc());
  });

  it('is pretty-printed and byte-deterministic for identical inputs', () => {
    const first = exportTemplateJson(doc(), fixedNow);
    const second = exportTemplateJson(doc(), fixedNow);
    expect(first).toBe(second);
    expect(first.split('\n')[1]).toContain('"format"');
    expect(first.endsWith('\n')).toBe(true);
  });
});

describe('parseTemplateJson', () => {
  it('accepts an exported envelope round-trip', () => {
    const text = exportTemplateJson(doc(), fixedNow);
    const result = parseTemplateJson(text);
    expect(result).toEqual({ ok: true, doc: doc() });
  });

  it('accepts a bare template doc without an envelope', () => {
    const result = parseTemplateJson(JSON.stringify(doc()));
    expect(result).toEqual({ ok: true, doc: doc() });
  });

  it('rejects malformed JSON', () => {
    const result = parseTemplateJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe('invalid-payload');
      expect(result.errors[0]?.message).toContain('not valid JSON');
    }
  });

  it('rejects a non-object payload', () => {
    const result = parseTemplateJson(JSON.stringify(42));
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown envelope format', () => {
    const payload = { format: 'other-thing', version: 1, doc: doc() };
    const result = parseTemplateJson(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toContain('unknown template file format');
    }
  });

  it('rejects an unsupported envelope version', () => {
    const payload = { format: TEMPLATE_FILE_FORMAT, version: 99, doc: doc() };
    const result = parseTemplateJson(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toContain('unsupported template file version');
    }
  });

  it('rejects docs that fail the schema', () => {
    const broken = doc();
    delete (broken as unknown as Record<string, unknown>).rootId;
    const result = parseTemplateJson(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe('invalid-payload');
    }
  });

  it('rejects docs with dangling childIds', () => {
    const broken = doc();
    broken.elements['page-root'].childIds = ['missing-child'];
    const result = parseTemplateJson(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('missing child'))).toBe(true);
    }
  });

  it('rejects docs whose rootId is missing from elements', () => {
    const broken = doc();
    broken.rootId = 'no-such-root';
    const result = parseTemplateJson(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('rootId "no-such-root"'))).toBe(true);
    }
  });

  it('rejects unreachable elements (cycles via asymmetric parents)', () => {
    const broken = doc();
    const orphan = JSON.parse(JSON.stringify(broken.elements['footer-text']));
    orphan.id = 'orphan-text';
    orphan.parentId = 'disconnected-section';
    broken.elements['orphan-text'] = orphan;
    const result = parseTemplateJson(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('not reachable from root'))).toBe(true);
    }
  });

  it('rejects content that does not match the element type', () => {
    const broken = doc();
    broken.elements['hero-heading'].content.base = { label: 'oops', href: '#' } as never;
    const result = parseTemplateJson(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.message.includes('does not match element type')),
      ).toBe(true);
    }
  });
});
