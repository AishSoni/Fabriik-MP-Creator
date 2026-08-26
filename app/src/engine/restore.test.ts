import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { resolveTree } from './resolve';
import { commitCommand } from './commit';
import { restoreRevision } from './restore';

const doc = () => createDefaultTemplate();

describe('restoreRevision', () => {
  it('restores a style edit for one element without touching others', () => {
    const d0 = doc();
    const first = commitCommand(d0, {}, {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: 0,
      stylePatch: { fontSize: 72 },
    });
    const second = commitCommand(first.doc, first.history, {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-subtext'],
      scope: 'all',
      baseRevision: first.doc.revision,
      stylePatch: { fontSize: 10 },
    });
    const entry = second.history['hero-heading'][0];
    const restored = restoreRevision(second.doc, entry);

    expect(resolveTree(restored.doc, 'desktop').get('hero-heading')?.style.fontSize).toBe(48);
    expect(resolveTree(restored.doc, 'desktop').get('hero-subtext')?.style.fontSize).toBe(10);
    expect(restored.revision?.kind).toBe('restore');
    expect(second.history['hero-subtext']).toHaveLength(1);
  });

  it('restores into the correct viewport layer only', () => {
    const d0 = doc();
    const committed = commitCommand(d0, {}, {
      kind: 'set-content',
      source: 'ai',
      targetIds: ['footer-text'],
      scope: 'mobile',
      baseRevision: 0,
      content: { text: 'Mobile footer' },
    });
    const entry = committed.history['footer-text'][0];
    const restored = restoreRevision(committed.doc, entry);
    expect(resolveTree(restored.doc, 'mobile').get('footer-text')?.content).toEqual({
      text: '© 2026 Landing Inc. All rights reserved.',
    });
    expect(resolveTree(restored.doc, 'desktop').get('footer-text')?.content).toEqual({
      text: '© 2026 Landing Inc. All rights reserved.',
    });
  });

  it('restore is recorded as a new history entry', () => {
    const committed = commitCommand(doc(), {}, {
      kind: 'set-style',
      source: 'ai',
      targetIds: ['cta-button'],
      scope: 'tablet',
      baseRevision: 0,
      stylePatch: { backgroundColor: '#000000' },
    });
    const historyBefore = committed.history['cta-button'].length;
    const restored = restoreRevision(committed.doc, committed.history['cta-button'][0]);
    const withRestore = { ...committed.history, 'cta-button': [...committed.history['cta-button'], restored.revision!] };
    expect(withRestore['cta-button']).toHaveLength(historyBefore + 1);
    expect(restored.revision?.source).toBe('restore');
  });

  it('undoing an insert removes the element again', () => {
    const d0 = doc();
    const newElement = JSON.parse(JSON.stringify(d0.elements['footer-text']));
    newElement.id = 'inserted-note';
    newElement.parentId = 'features-section';
    const committed = commitCommand(d0, {}, {
      kind: 'insert',
      source: 'canvas',
      targetIds: [],
      scope: 'all',
      baseRevision: 0,
      parentId: 'features-section',
      index: 3,
      element: newElement,
    });
    expect(committed.doc.elements['inserted-note']).toBeDefined();
    const restored = restoreRevision(committed.doc, committed.history['inserted-note'][0]);
    expect(restored.doc.elements['inserted-note']).toBeUndefined();
    expect(restored.doc.elements['features-section'].childIds).toHaveLength(3);
  });

  it('undoing a removal re-inserts the subtree at its original position', () => {
    const committed = commitCommand(doc(), {}, {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1'],
      scope: 'all',
      baseRevision: 0,
    });
    const restored = restoreRevision(committed.doc, committed.history['feature-card-1'][0]);
    expect(restored.doc.elements['feature-card-1']).toBeDefined();
    expect(restored.doc.elements['feature-1-title']).toBeDefined();
    const childIds = restored.doc.elements['features-section'].childIds;
    expect(childIds.indexOf('feature-card-1')).toBe(1);
  });

  it('undoing a reorder returns the element to its previous index', () => {
    const committed = commitCommand(doc(), {}, {
      kind: 'reorder',
      source: 'canvas',
      targetIds: ['footer-section'],
      scope: 'all',
      baseRevision: 0,
      index: 0,
    });
    const restored = restoreRevision(committed.doc, committed.history['footer-section'][0]);
    expect(restored.doc.elements['page-root'].childIds.indexOf('footer-section')).toBe(5);
  });
});
