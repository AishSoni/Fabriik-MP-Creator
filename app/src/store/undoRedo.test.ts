import { beforeEach, describe, expect, it } from 'vitest';
import { useTemplateStore, MAX_UNDO_STEPS } from './templateStore';
import type { EditCommand, SetContentCommand, SetStyleCommand } from '../types/commands';

const state = () => useTemplateStore.getState();

type DraftCommand = Omit<SetContentCommand, 'baseRevision'> | Omit<SetStyleCommand, 'baseRevision'>;

function dispatch(cmd: DraftCommand) {
  const errors = state().dispatch({ ...cmd, baseRevision: state().doc.revision } as EditCommand);
  expect(errors).toEqual([]);
}

function totalEntries() {
  return Object.values(state().history).reduce((n, list) => n + list.length, 0);
}

beforeEach(() => {
  localStorage.clear();
  state().loadTemplate('tpl-landing-v1');
});

describe('global undo/redo', () => {
  it('undoes and redoes a single dispatch while appending to history', () => {
    const before = (state().doc.elements['hero-heading'].content.base as { text: string }).text;
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Changed headline' },
    });
    expect((state().doc.elements['hero-heading'].content.base as { text: string }).text).toBe('Changed headline');
    expect(state().history['hero-heading']).toHaveLength(1);

    state().undo();
    expect((state().doc.elements['hero-heading'].content.base as { text: string }).text).toBe(before);
    // Append-only: the undo itself is a new entry on top, nothing is removed.
    expect(state().history['hero-heading']).toHaveLength(2);

    state().redo();
    expect((state().doc.elements['hero-heading'].content.base as { text: string }).text).toBe('Changed headline');
    // Redo is likewise a new entry on top of the last change.
    expect(state().history['hero-heading']).toHaveLength(3);
  });

  it('never removes history entries across undo/redo sequences', () => {
    const keysBefore = Object.keys(state().history).length;
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'First' },
    });
    const afterEdit = totalEntries();
    const keysAfterEdit = Object.keys(state().history).length;

    state().undo();
    expect(totalEntries()).toBeGreaterThanOrEqual(afterEdit);
    expect(Object.keys(state().history).length).toBeGreaterThanOrEqual(keysAfterEdit);

    state().redo();
    expect(totalEntries()).toBeGreaterThanOrEqual(afterEdit);
    expect(Object.keys(state().history).length).toBeGreaterThanOrEqual(keysBefore);
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

    state().undo();
    expect(state().doc.elements['hero-heading'].style.base.color).not.toBe('#ff0000');
    expect(state().doc.elements['hero-subtext'].style.base.color).not.toBe('#ff0000');
    expect(state().history['hero-heading']).toHaveLength(2);
    expect(state().history['hero-subtext']).toHaveLength(2);

    // Redo is itself one step back on top of the undo stack.
    state().redo();
    expect(state().doc.elements['hero-heading'].style.base.color).toBe('#ff0000');
    expect(state().history['hero-heading']).toHaveLength(3);
    state().undo();
    expect(state().doc.elements['hero-heading'].style.base.color).not.toBe('#ff0000');
    expect(state().history['hero-heading']).toHaveLength(4);
  });

  it('treats dispatchMany (code Apply) as one atomic undo step', () => {
    const revision = state().doc.revision;
    const errors = state().dispatchMany([
      {
        kind: 'set-content',
        source: 'code',
        targetIds: ['hero-heading'],
        scope: 'all',
        baseRevision: revision,
        content: { text: 'Batch one' },
      } as EditCommand,
      {
        kind: 'set-content',
        source: 'code',
        targetIds: ['footer-text'],
        scope: 'all',
        baseRevision: revision,
        content: { text: 'Batch two' },
      } as EditCommand,
    ]);
    expect(errors).toEqual([]);
    expect(state().past).toHaveLength(1);

    state().undo();
    expect((state().doc.elements['hero-heading'].content.base as { text: string }).text).not.toBe('Batch one');
    expect((state().doc.elements['footer-text'].content.base as { text: string }).text).not.toBe('Batch two');

    state().redo();
    expect((state().doc.elements['hero-heading'].content.base as { text: string }).text).toBe('Batch one');
  });

  it('clears the redo stack on a new edit', () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'First' },
    });
    state().undo();
    expect(state().future).toHaveLength(1);

    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Second' },
    });
    expect(state().future).toHaveLength(0);
  });

  it('makes per-element restore itself undoable', () => {
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
    expect(state().history['hero-heading']).toHaveLength(2);

    state().undo();
    expect(state().doc.elements['hero-heading'].style.base.fontSize).toBe(99);
    expect(state().history['hero-heading']).toHaveLength(3);

    state().redo();
    expect(state().doc.elements['hero-heading'].style.base.fontSize).not.toBe(99);
    expect(state().history['hero-heading']).toHaveLength(4);
  });

  it('undoes and redoes a structural remove while appending to history', () => {
    const errors = state().dispatch({
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1'],
      scope: 'all',
      baseRevision: state().doc.revision,
    } as EditCommand);
    expect(errors).toEqual([]);
    expect(state().doc.elements['feature-card-1']).toBeUndefined();
    const afterRemove = totalEntries();

    state().undo();
    expect(state().doc.elements['feature-card-1']).toBeDefined();
    expect(totalEntries()).toBeGreaterThan(afterRemove);

    const afterUndo = totalEntries();
    state().redo();
    expect(state().doc.elements['feature-card-1']).toBeUndefined();
    expect(totalEntries()).toBeGreaterThan(afterUndo);
  });

  it('is a no-op with empty stacks', () => {
    const doc = state().doc;
    const total = totalEntries();
    state().undo();
    state().redo();
    expect(state().doc).toBe(doc);
    expect(totalEntries()).toBe(total);
  });

  it('caps the undo stack at MAX_UNDO_STEPS', () => {
    for (let i = 0; i < MAX_UNDO_STEPS + 5; i += 1) {
      dispatch({
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        content: { text: `Edit ${i}` },
      });
    }
    expect(state().past).toHaveLength(MAX_UNDO_STEPS);
  });

  it('clears stacks on template switch and reset', () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Dirty' },
    });
    expect(state().past.length).toBeGreaterThan(0);
    state().resetDoc();
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);

    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Dirty again' },
    });
    state().loadTemplate('tpl-portfolio-v1');
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);
  });

  it('persists past/future alongside doc and history', () => {
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Persist me' },
    });
    const raw = localStorage.getItem('fabriik-template-v1');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.version).toBe(4);
    expect(persisted.state.past).toHaveLength(1);
    expect(persisted.state.past[0].revisions).toHaveLength(1);
    expect(persisted.state.future).toHaveLength(0);
  });
});
