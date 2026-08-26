import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { resolveElement, resolveTree } from './resolve';
import { commitCommand } from './commit';
import type { EditCommand, HistoryLog } from '../types/commands';

const doc = () => createDefaultTemplate();

describe('resolution', () => {
  it('falls back to base when no override exists', () => {
    const d = doc();
    const desktop = resolveElement(d.elements['hero-section'], 'desktop');
    expect(desktop.style.paddingX).toBe(48);
  });

  it('applies viewport overrides only for that viewport', () => {
    const d = doc();
    const mobile = resolveElement(d.elements['hero-heading'], 'mobile');
    const tablet = resolveElement(d.elements['hero-heading'], 'tablet');
    expect(mobile.style.fontSize).toBe(32);
    expect(tablet.style.fontSize).toBe(40);
  });
});

describe('commitCommand', () => {
  it('bumps revision and records one revision per affected element', () => {
    let d = doc();
    let history: HistoryLog = {};
    const cmd: EditCommand = {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading', 'hero-subtext'],
      scope: 'all',
      baseRevision: 0,
      stylePatch: { color: '#ff0000' },
    };
    const result = commitCommand(d, history, cmd);
    d = result.doc;
    history = result.history;
    expect(d.revision).toBe(1);
    expect(result.revisions).toHaveLength(2);
    expect(history['hero-heading']).toHaveLength(1);
    expect(history['hero-subtext']).toHaveLength(1);
  });

  it('a mobile-scoped edit leaves other viewports unchanged', () => {
    const d0 = doc();
    const before = resolveTree(d0, 'desktop');
    const result = commitCommand(d0, {}, {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'mobile',
      baseRevision: 0,
      stylePatch: { fontSize: 20 },
    });
    const after = resolveTree(result.doc, 'desktop');
    expect(after.get('hero-heading')?.style.fontSize).toBe(before.get('hero-heading')?.style.fontSize);
    expect(resolveTree(result.doc, 'tablet').get('hero-heading')?.style.fontSize).toBe(40);
    expect(resolveTree(result.doc, 'mobile').get('hero-heading')?.style.fontSize).toBe(20);
  });

  it('a shared edit respects existing viewport overrides', () => {
    const result = commitCommand(doc(), {}, {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: 0,
      stylePatch: { fontSize: 60 },
    });
    expect(resolveTree(result.doc, 'desktop').get('hero-heading')?.style.fontSize).toBe(60);
    expect(resolveTree(result.doc, 'mobile').get('hero-heading')?.style.fontSize).toBe(32);
  });

  it('a shared content edit changes all viewports without overrides', () => {
    const result = commitCommand(doc(), {}, {
      kind: 'set-content',
      source: 'code',
      targetIds: ['footer-text'],
      scope: 'all',
      baseRevision: 0,
      content: { text: 'New footer' },
    });
    for (const vp of ['desktop', 'tablet', 'mobile'] as const) {
      expect(resolveTree(result.doc, vp).get('footer-text')?.content).toEqual({ text: 'New footer' });
    }
  });

  it('remove captures the subtree for later recovery', () => {
    const result = commitCommand(doc(), {}, {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1'],
      scope: 'all',
      baseRevision: 0,
    });
    expect(result.doc.elements['feature-card-1']).toBeUndefined();
    expect(result.doc.elements['features-section'].childIds).not.toContain('feature-card-1');
    const entry = result.history['feature-card-1'][0];
    expect(entry.structural?.op).toBe('remove');
    expect(entry.structural?.removedSubtree?.map((e) => e.id)).toEqual([
      'feature-card-1',
      'feature-1-title',
      'feature-1-text',
    ]);
  });

  it('reorder updates sibling order and records previous index', () => {
    const result = commitCommand(doc(), {}, {
      kind: 'reorder',
      source: 'canvas',
      targetIds: ['cta-section'],
      scope: 'all',
      baseRevision: 0,
      index: 1,
    });
    expect(result.doc.elements['page-root'].childIds[1]).toBe('cta-section');
    expect(result.history['cta-section'][0].structural).toMatchObject({
      op: 'reorder',
      previousIndex: 4,
      index: 1,
    });
  });
});
