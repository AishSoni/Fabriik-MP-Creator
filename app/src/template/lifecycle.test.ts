import { beforeEach, describe, expect, it } from 'vitest';
import { useTemplateStore } from '../store/templateStore';
import { TEMPLATES, getTemplateById } from './index';

beforeEach(() => {
  localStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
});

describe('template registry + store lifecycle', () => {
  it('exposes every registered fixture', () => {
    expect(getTemplateById('tpl-landing-v1')).toBeDefined();
    for (const definition of TEMPLATES) {
      expect(useTemplateStore.getState().loadTemplate(definition.id)).toBeNull();
      expect(useTemplateStore.getState().doc.templateId).toBe(definition.id);
    }
  });

  it('switching templates discards edits and history', () => {
    const store = useTemplateStore.getState();
    store.dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: store.doc.revision,
      stylePatch: { fontSize: 90 },
    });
    expect(Object.keys(useTemplateStore.getState().history)).toHaveLength(1);

    useTemplateStore.getState().loadTemplate('tpl-portfolio-v1');
    const after = useTemplateStore.getState();
    expect(after.doc.templateId).toBe('tpl-portfolio-v1');
    expect(after.history).toEqual({});
    expect(after.activeTemplateId).toBe('tpl-portfolio-v1');
    expect(after.doc.elements['intro-heading']).toBeDefined();
  });

  it('reset restores the active template, not the default one', () => {
    useTemplateStore.getState().loadTemplate('tpl-bistro-v1');
    const store = useTemplateStore.getState();
    store.dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['welcome-heading'],
      scope: 'all',
      baseRevision: store.doc.revision,
      content: { text: 'edited' },
    });

    useTemplateStore.getState().resetDoc();
    const after = useTemplateStore.getState();
    expect(after.activeTemplateId).toBe('tpl-bistro-v1');
    expect(after.doc.templateId).toBe('tpl-bistro-v1');
    expect((after.doc.elements['welcome-heading'].content.base as { text: string }).text).not.toBe('edited');
  });

  it('rejects unknown template ids through the error surface', () => {
    const errors = useTemplateStore.getState().loadTemplate('tpl-nope');
    expect(errors?.[0].code).toBe('unknown-element');
    expect(useTemplateStore.getState().lastErrors[0].code).toBe('unknown-element');
    expect(useTemplateStore.getState().activeTemplateId).toBe('tpl-landing-v1');
  });
});
