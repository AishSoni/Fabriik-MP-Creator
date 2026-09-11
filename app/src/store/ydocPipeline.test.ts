import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTemplateYdoc,
  resetYdocPipeline,
  useTemplateStore,
} from './templateStore';
import { setYdocPipeline } from '../collab/flag';
import { applyCommandToYDoc } from '../collab/commandAdapter';
import type { CollabRevisionEntry } from '../collab/commandAdapter';
import { getHistoryYArray, projectDoc } from '../collab/schema';
import type { EditCommand, SetContentCommand, SetStyleCommand } from '../types/commands';

const state = () => useTemplateStore.getState();

const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type DraftCommand = Omit<SetContentCommand, 'baseRevision'> | Omit<SetStyleCommand, 'baseRevision'>;

function dispatch(cmd: DraftCommand) {
  return state().dispatch({ ...cmd, baseRevision: state().doc.revision } as EditCommand);
}

const yHistory = (): CollabRevisionEntry[] =>
  getHistoryYArray(getTemplateYdoc()).toJSON() as CollabRevisionEntry[];

const totalYEntries = (): number => yHistory().length;

const totalGrouped = (): number =>
  Object.values(state().history).reduce((n, list) => n + list.length, 0);

const textOf = (id: string): string =>
  (state().doc.elements[id].content.base as { text: string }).text;

beforeEach(() => {
  localStorage.clear();
  resetYdocPipeline();
  setYdocPipeline(false);
  state().loadTemplate('tpl-landing-v1');
  setYdocPipeline(true);
});

describe('YDoc pipeline dispatch', () => {
  it('applies through the Y doc and projects the result back into the store', () => {
    const errors = dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Projected headline' },
    });
    expect(errors).toEqual([]);
    expect(textOf('hero-heading')).toBe('Projected headline');

    const ydoc = getTemplateYdoc();
    expect(projectDoc(ydoc)).toEqual(state().doc);
    expect(yHistory()).toHaveLength(1);
    expect(state().past).toHaveLength(1);
    expect(state().future).toHaveLength(0);
    expect(state().lastErrors).toEqual([]);
  });

  it('appends authoritative history grouped by element without baseRevision', () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'First' },
    });
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['footer-text'],
      scope: 'all',
      content: { text: 'Second' },
    });

    expect(totalYEntries()).toBe(2);
    expect(totalGrouped()).toBe(2);
    expect(state().history['hero-heading']).toHaveLength(1);
    expect(state().history['footer-text']).toHaveLength(1);
    for (const entry of state().history['hero-heading']) {
      expect('baseRevision' in entry).toBe(false);
      expect(entry.commandId).not.toBe('');
    }
  });

  it('stamps a fresh commandId per dispatch', () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'One' },
    });
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Two' },
    });
    const [first, second] = state().history['hero-heading'];
    expect(first.commandId).not.toBe(second.commandId);
  });

  it('rejects invalid commands without touching the Y doc', () => {
    const before = state().doc;
    const errors = dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['no-such-element'],
      scope: 'all',
      content: { text: 'ghost' },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe('unknown-element');
    expect(state().doc).toBe(before);
    expect(totalYEntries()).toBe(0);
    expect(state().past).toHaveLength(0);
    expect(state().lastErrors).toEqual(errors);

    const rootErrors = state().dispatch({
      kind: 'remove',
      source: 'canvas',
      targetIds: ['page-root'],
      scope: 'all',
      baseRevision: 0,
    });
    expect(rootErrors[0].code).toBe('forbidden-field');
    expect(totalYEntries()).toBe(0);
  });

  it('treats dispatchMany as one atomic undo step', () => {
    const errors = state().dispatchMany([
      {
        kind: 'set-content',
        source: 'code',
        targetIds: ['hero-heading'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Batch one' },
      },
      {
        kind: 'set-content',
        source: 'code',
        targetIds: ['footer-text'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Batch two' },
      },
    ]);
    expect(errors).toEqual([]);
    expect(textOf('hero-heading')).toBe('Batch one');
    expect(textOf('footer-text')).toBe('Batch two');
    expect(state().past).toHaveLength(1);
    expect(totalYEntries()).toBe(2);

    state().undo();
    expect(textOf('hero-heading')).not.toBe('Batch one');
    expect(textOf('footer-text')).not.toBe('Batch two');

    state().redo();
    expect(textOf('hero-heading')).toBe('Batch one');
    expect(textOf('footer-text')).toBe('Batch two');
  });

  it('rejects a batch whose later command fails and leaves the Y doc untouched', () => {
    const before = state().doc;
    const yEntriesBefore = totalYEntries();

    const errors = state().dispatchMany([
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['feature-card-1'],
        scope: 'all',
        baseRevision: 0,
      },
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['feature-1-title'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Ghost after remove' },
      },
    ]);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe('unknown-element');
    expect(state().doc).toBe(before);
    expect(state().doc.elements['feature-card-1']).toBeDefined();
    expect(state().doc.elements['feature-1-title'].content.base).toEqual({
      text: 'Modular elements',
    });
    expect(totalYEntries()).toBe(yEntriesBefore);
    expect(getHistoryYArray(getTemplateYdoc()).length).toBe(0);
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);
    expect(state().lastErrors).toEqual(errors);
  });

  it('treats a multi-element command as one atomic undo step', () => {
    dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading', 'hero-subtext'],
      scope: 'all',
      stylePatch: { color: '#ff0000' },
    });
    expect(state().past).toHaveLength(1);
    expect(totalYEntries()).toBe(2);

    state().undo();
    expect(state().doc.elements['hero-heading'].style.base.color).not.toBe('#ff0000');
    expect(state().doc.elements['hero-subtext'].style.base.color).not.toBe('#ff0000');
    expect(totalYEntries()).toBe(4);

    state().redo();
    expect(state().doc.elements['hero-heading'].style.base.color).toBe('#ff0000');
    expect(totalYEntries()).toBe(6);
  });
});

describe('YDoc pipeline undo/redo', () => {
  it('undoes and redoes a dispatch while keeping history append-only', () => {
    const before = textOf('hero-heading');
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Changed headline' },
    });
    expect(textOf('hero-heading')).toBe('Changed headline');

    state().undo();
    expect(textOf('hero-heading')).toBe(before);
    expect(totalYEntries()).toBe(2);
    expect(state().history['hero-heading']).toHaveLength(2);
    expect(state().future).toHaveLength(1);

    state().redo();
    expect(textOf('hero-heading')).toBe('Changed headline');
    expect(totalYEntries()).toBe(3);
  });

  it('undoes and redoes a structural remove with its subtree', () => {
    const errors = state().dispatch({
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1'],
      scope: 'all',
      baseRevision: 0,
    });
    expect(errors).toEqual([]);
    expect(state().doc.elements['feature-card-1']).toBeUndefined();

    state().undo();
    expect(state().doc.elements['feature-card-1']).toBeDefined();
    expect(state().doc.elements['feature-card-1'].childIds).toEqual([
      'feature-1-title',
      'feature-1-text',
    ]);
    expect(state().doc.elements['feature-1-title']).toBeDefined();

    state().redo();
    expect(state().doc.elements['feature-card-1']).toBeUndefined();
    expect(state().doc.elements['feature-1-title']).toBeUndefined();
  });

  it('is a no-op with an empty past stack', () => {
    const doc = state().doc;
    state().undo();
    expect(state().doc).toBe(doc);
    expect(state().future).toHaveLength(0);
  });
});

describe('YDoc pipeline restore', () => {
  it('routes restore through the command pipeline and stays undoable', () => {
    dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      stylePatch: { fontSize: 99 },
    });
    const entry = state().history['hero-heading'][0];

    state().restore(entry);
    expect(state().doc.elements['hero-heading'].style.base.fontSize).not.toBe(99);
    expect(totalYEntries()).toBe(2);
    expect(state().history['hero-heading']).toHaveLength(2);

    state().undo();
    expect(state().doc.elements['hero-heading'].style.base.fontSize).toBe(99);
    expect(totalYEntries()).toBe(3);

    state().redo();
    expect(state().doc.elements['hero-heading'].style.base.fontSize).not.toBe(99);
    expect(totalYEntries()).toBe(4);
  });

  it('reports invalid-target when the entry is no longer restorable', () => {
    const errors = state().restore({
      id: 'rev-ghost',
      commandId: 'cmd-ghost',
      elementId: 'no-such-element',
      scope: 'all',
      source: 'canvas',
      kind: 'manual',
      label: 'ghost',
      before: {},
      after: {},
      timestamp: 0,
    });
    expect(errors).toBeUndefined();
    expect(state().lastErrors[0].code).toBe('invalid-target');
    expect(totalYEntries()).toBe(0);
  });
});

describe('YDoc pipeline projection subscription', () => {
  it('pushes external Y doc changes into the store without appending history', async () => {
    applyCommandToYDoc(
      getTemplateYdoc(),
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        baseRevision: 0,
        stylePatch: { color: '#abcdef' },
      },
      { origin: 'optimistic', commandId: 'external-1' },
    );
    expect(state().doc.elements['hero-heading'].style.base.color).not.toBe('#abcdef');

    await flushMicrotasks();

    expect(state().doc.elements['hero-heading'].style.base.color).toBe('#abcdef');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
    expect(totalYEntries()).toBe(0);
    expect(totalGrouped()).toBe(0);
  });
});

describe('flag OFF keeps the legacy pipeline', () => {
  it('dispatches through immer with revision increments and untouched Y history', () => {
    setYdocPipeline(false);
    const ydoc = getTemplateYdoc();

    const errors = dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Legacy edit' },
    });
    expect(errors).toEqual([]);
    expect(textOf('hero-heading')).toBe('Legacy edit');
    expect(state().doc.revision).toBe(1);
    expect(projectDoc(ydoc).elements['hero-heading'].content.base).toEqual({
      text: 'Main Hero Message to Sell Yourself!',
    });
    expect(getHistoryYArray(ydoc).length).toBe(0);
    expect(state().past).toHaveLength(1);
  });
});

describe('YDoc pipeline whole-doc ops', () => {
  const importedDoc = () => ({
    templateId: 'tpl-imported-v1',
    templateName: 'Imported Template',
    revision: 7,
    rootId: 'imported-root',
    elements: {
      'imported-root': {
        id: 'imported-root',
        type: 'section',
        parentId: null,
        childIds: ['imported-heading'],
        content: { base: {} },
        style: { base: {} },
      },
      'imported-heading': {
        id: 'imported-heading',
        type: 'heading',
        parentId: 'imported-root',
        childIds: [],
        content: { base: { text: 'Imported heading' } },
        style: { base: { fontSize: 40 } },
      },
    },
  });

  it('loadTemplate swaps the Y doc atomically and clears history', async () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Before swap' },
    });
    expect(totalYEntries()).toBe(1);

    const errors = state().loadTemplate('tpl-editorial-v1');
    expect(errors).toBeNull();
    expect(state().activeTemplateId).toBe('tpl-editorial-v1');
    expect(state().doc.templateId).toBe('tpl-editorial-v1');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
    expect(getHistoryYArray(getTemplateYdoc()).length).toBe(0);
    expect(totalGrouped()).toBe(0);
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);

    await flushMicrotasks();
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
  });

  it('loadTemplate with an unknown id reports errors without touching the Y doc', () => {
    const before = state().doc;
    const errors = state().loadTemplate('tpl-nope-v1');
    expect(errors?.[0].code).toBe('unknown-element');
    expect(state().doc).toBe(before);
    expect(projectDoc(getTemplateYdoc())).toEqual(before);
    expect(state().past).toHaveLength(0);
  });

  it('importDoc adopts a valid doc through replaceYDoc and clears history', () => {
    const errors = state().importDoc(importedDoc());
    expect(errors).toBeNull();
    expect(state().activeTemplateId).toBe('tpl-imported-v1');
    expect(state().doc.templateId).toBe('tpl-imported-v1');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
    expect(getHistoryYArray(getTemplateYdoc()).length).toBe(0);
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);
  });

  it('importDoc rejects an invalid doc without touching the Y doc', () => {
    const before = state().doc;
    const errors = state().importDoc({ templateId: 'broken' });
    expect(errors?.length).toBeGreaterThan(0);
    expect(state().doc).toBe(before);
    expect(projectDoc(getTemplateYdoc())).toEqual(before);
    expect(getHistoryYArray(getTemplateYdoc()).length).toBe(0);
  });

  it('resetDoc rebuilds the active template and clears history', () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Dirtied' },
    });
    state().resetDoc();
    expect(textOf('hero-heading')).toBe('Main Hero Message to Sell Yourself!');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
    expect(getHistoryYArray(getTemplateYdoc()).length).toBe(0);
    expect(state().past).toHaveLength(0);
    expect(state().activeTemplateId).toBe('tpl-landing-v1');
  });

  it('replaceDoc folds the diff and rename into one undoable step with the Y doc in sync', () => {
    const originalName = state().doc.templateName;
    const candidate = JSON.parse(JSON.stringify(state().doc)) as Record<string, unknown>;
    const elements = (candidate.elements as Record<string, { content: { base: { text: string } } }>);
    candidate.templateName = 'Renamed Landing';
    elements['hero-heading'].content.base.text = 'Coded headline';

    const errors = state().replaceDoc(candidate);
    expect(errors).toEqual([]);
    expect(state().doc.templateName).toBe('Renamed Landing');
    expect(textOf('hero-heading')).toBe('Coded headline');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
    expect(state().past).toHaveLength(1);
    expect(totalYEntries()).toBe(1);

    state().undo();
    expect(textOf('hero-heading')).toBe('Main Hero Message to Sell Yourself!');
    expect(state().doc.templateName).toBe('Renamed Landing');

    state().redo();
    expect(textOf('hero-heading')).toBe('Coded headline');
    expect(state().doc.templateName).toBe('Renamed Landing');
    expect(originalName).not.toBe('Renamed Landing');
  });

  it('replaceDoc with a name-only change is a revision-less undoable step', () => {
    getTemplateYdoc();
    const originalName = state().doc.templateName;
    const candidate = JSON.parse(JSON.stringify(state().doc)) as Record<string, unknown>;
    candidate.templateName = 'Just Renamed';

    const errors = state().replaceDoc(candidate);
    expect(errors).toEqual([]);
    expect(state().doc.templateName).toBe('Just Renamed');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
    expect(state().past).toHaveLength(1);
    expect(totalYEntries()).toBe(0);

    state().undo();
    expect(state().doc.templateName).toBe(originalName);
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);

    state().redo();
    expect(state().doc.templateName).toBe('Just Renamed');
    expect(projectDoc(getTemplateYdoc())).toEqual(state().doc);
  });

  it('replaceDoc rejects an invalid doc without touching the Y doc', () => {
    const before = state().doc;
    const errors = state().replaceDoc({ nope: true });
    expect(errors?.[0].code).toBe('invalid-payload');
    expect(state().doc).toBe(before);
    expect(projectDoc(getTemplateYdoc())).toEqual(before);
    expect(getHistoryYArray(getTemplateYdoc()).length).toBe(0);
  });
});
