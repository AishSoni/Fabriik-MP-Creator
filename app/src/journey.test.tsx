import { beforeEach, describe, expect, it } from 'vitest';
import { useTemplateStore } from './store/templateStore';
import { useEditorStore } from './store/editorStore';
import { useReviewStore } from './store/reviewStore';
import { runDemoEngine } from './engine/ai/scenarioEngine';
import { resolveTree } from './engine/resolve';
import type { EditCommand } from './types/commands';

const template = () => useTemplateStore.getState();

beforeEach(() => {
  template().resetDoc();
  useEditorStore.getState().clearSelection();
  useReviewStore.getState().setPendingResult(null);
  localStorage.clear();
});

describe('end-to-end editor journey', () => {
  it('canvas edit → code edit → AI multi-element partial accept → independent recovery', () => {
    const dispatch = (cmd: Omit<EditCommand, 'baseRevision'> & Record<string, unknown>) => {
      const errors = template().dispatch({ ...cmd, baseRevision: template().doc.revision } as EditCommand);
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
    expect(template().doc.revision).toBeGreaterThan(historyAfterAccept.length);
  });

  it('persisted state survives a simulated refresh and reset restores the original template', () => {
    template().dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['cta-button'],
      scope: 'tablet',
      baseRevision: template().doc.revision,
      stylePatch: { backgroundColor: '#ff0055' },
    });

    const persisted = JSON.parse(localStorage.getItem('sate-template-v1')!);
    expect(persisted.state.doc.elements['cta-button'].style.overrides.tablet.backgroundColor).toBe('#ff0055');
    expect(persisted.state.history['cta-button']).toHaveLength(1);

    template().resetDoc();
    expect(resolveTree(template().doc, 'tablet').get('cta-button')?.style.backgroundColor).toBe('#4f46e5');
    expect(Object.keys(template().history)).toHaveLength(0);
  });
});





