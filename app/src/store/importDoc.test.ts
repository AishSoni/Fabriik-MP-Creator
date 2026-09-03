import { beforeEach, describe, expect, it } from 'vitest';
import { useTemplateStore } from './templateStore';
import { createDefaultTemplate } from '../template/defaultTemplate';
import type { TemplateDoc } from '../types/template';

const doc = (): TemplateDoc =>
  JSON.parse(JSON.stringify(createDefaultTemplate())) as TemplateDoc;

beforeEach(() => {
  localStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
});

const editCurrentDoc = () => {
  useTemplateStore.getState().dispatch({
    kind: 'set-style',
    source: 'canvas',
    targetIds: ['hero-heading'],
    scope: 'all',
    baseRevision: useTemplateStore.getState().doc.revision,
    stylePatch: { fontSize: 88 },
  });
};

describe('importDoc', () => {
  it('replaces the doc, resets history, and adopts the imported template id', () => {
    editCurrentDoc();
    expect(Object.keys(useTemplateStore.getState().history)).toHaveLength(1);

    const imported = doc();
    imported.templateId = 'tpl-imported-x1';
    imported.templateName = 'Imported Template';
    const result = useTemplateStore.getState().importDoc(imported);

    expect(result).toBeNull();
    const state = useTemplateStore.getState();
    expect(state.doc.templateId).toBe('tpl-imported-x1');
    expect(state.doc.templateName).toBe('Imported Template');
    expect(state.history).toEqual({});
    expect(state.activeTemplateId).toBe('tpl-imported-x1');
    expect(state.lastErrors).toEqual([]);
  });

  it('fills in missing default content bases', () => {
    const imported = doc();
    delete imported.elements['hero-heading'].content.base;
    const result = useTemplateStore.getState().importDoc(imported);

    expect(result).toBeNull();
    expect(useTemplateStore.getState().doc.elements['hero-heading'].content.base).toEqual({
      text: '',
    });
  });

  it('leaves state untouched when the schema rejects the doc', () => {
    const before = useTemplateStore.getState().doc;
    const imported = doc();
    (imported as unknown as Record<string, unknown>).revision = -5;
    const result = useTemplateStore.getState().importDoc(imported);

    expect(result?.[0]?.code).toBe('invalid-payload');
    const state = useTemplateStore.getState();
    expect(state.doc).toBe(before);
    expect(state.lastErrors).toEqual(result);
  });

  it('leaves state untouched when semantics reject the doc', () => {
    const before = useTemplateStore.getState().doc;
    const imported = doc();
    imported.elements['page-root'].childIds = ['missing-child'];
    const result = useTemplateStore.getState().importDoc(imported);

    expect(result?.some((e) => e.message.includes('missing child'))).toBe(true);
    const state = useTemplateStore.getState();
    expect(state.doc).toBe(before);
    expect(state.history).toEqual({});
  });
});
