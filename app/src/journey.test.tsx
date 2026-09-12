import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTemplateYdoc,
  resetYdocPipeline,
  useTemplateStore,
  whenTemplatePersistenceReady,
} from './store/templateStore';
import { useEditorStore } from './store/editorStore';
import { useReviewStore } from './store/reviewStore';
import { runDemoEngine } from './engine/ai/scenarioEngine';
import { resolveTree } from './engine/resolve';
import { DEFAULT_YDOC_DB_NAME } from './collab/persistence';
import type { EditCommand } from './types/commands';

const template = () => useTemplateStore.getState();
const legacyKey = 'fabriik-template-v1';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const deleteDb = async (name: string): Promise<void> => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};

beforeEach(async () => {
  localStorage.clear();
  resetYdocPipeline();
  await deleteDb(DEFAULT_YDOC_DB_NAME);
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
  useEditorStore.getState().clearSelection();
  useReviewStore.getState().setPendingResult(null);
});

describe('end-to-end editor journey', () => {
  it('canvas edit → code edit → AI multi-element partial accept → independent recovery', () => {
    const dispatch = (cmd: EditCommand) => {
      const errors = template().dispatch(cmd);
      expect(errors).toEqual([]);
    };

    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Hand-edited headline' },
    });

    const codeDoc = JSON.parse(JSON.stringify(template().doc));
    codeDoc.elements['hero-heading'].style.base.color = '#0a0a0a';
    expect(template().replaceDoc(codeDoc)).toEqual([]);

    const aiResult = runDemoEngine(
      { instruction: 'Make all selected elements bolder', selectedIds: ['feature-1-title', 'feature-2-title'], scope: 'all' },
      template().doc,
    );
    expect(aiResult.proposals).toHaveLength(2);
    useReviewStore.getState().setPendingResult(aiResult);

    useReviewStore.getState().acceptProposal(aiResult.proposals[0].proposalId);
    useReviewStore.getState().rejectProposal(aiResult.proposals[1].proposalId);

    const summary = useReviewStore.getState().pendingResult?.proposals.map((p) => p.status);
    expect(summary).toEqual(['accepted', 'rejected']);
    expect(template().doc.elements['feature-1-title'].style.base.fontWeight).toBe(800);
    expect(template().doc.elements['feature-2-title'].style.base.fontWeight).toBe(700);

    const historyAfterAccept = Object.values(template().history).flat();
    expect(historyAfterAccept.some((r) => r.source === 'ai' && r.elementId === 'feature-1-title')).toBe(true);
    expect(historyAfterAccept.some((r) => r.source === 'ai' && r.elementId === 'feature-2-title')).toBe(false);

    const restoreEntry = template().history['feature-1-title'][0];
    template().restore(restoreEntry);
    expect(template().doc.elements['feature-1-title'].style.base.fontWeight).toBe(700);
    expect((template().doc.elements['hero-heading'].content.base as { text: string }).text).toBe('Hand-edited headline');

    const historyAfterRestore = Object.values(template().history).flat();
    expect(historyAfterRestore.length).toBeGreaterThan(historyAfterAccept.length);
    expect(historyAfterRestore.some((r) => r.source === 'restore')).toBe(true);
  });

  it('persisted state survives a simulated refresh and reset restores the original template', async () => {
    template().dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['cta-button'],
      scope: 'tablet',
      stylePatch: { backgroundColor: '#ff0055' },
    });

    await whenTemplatePersistenceReady();
    await flush();

    resetYdocPipeline();
    getTemplateYdoc();
    await whenTemplatePersistenceReady();
    await flush();

    expect(resolveTree(template().doc, 'tablet').get('cta-button')?.style.backgroundColor).toBe('#ff0055');
    expect(Object.values(template().history).flat()).toHaveLength(1);

    template().resetDoc();
    expect(resolveTree(template().doc, 'tablet').get('cta-button')?.style.backgroundColor).toBe('#4f46e5');
    expect(Object.keys(template().history)).toHaveLength(0);
  });

  it('ignores an unparsable legacy payload, keeps the seed, and removes the key', async () => {
    resetYdocPipeline();
    await deleteDb(DEFAULT_YDOC_DB_NAME);
    localStorage.setItem(legacyKey, 'not-json-at-all');

    getTemplateYdoc();
    await whenTemplatePersistenceReady();
    await flush();

    expect(template().doc.templateId).toBe('tpl-landing-v1');
    expect(template().doc.elements['hero-heading']).toBeDefined();
    expect(template().lastErrors).toEqual([]);
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });
});
