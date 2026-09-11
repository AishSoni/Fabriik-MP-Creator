import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { applyCommand } from '../engine/commit';
import { restoreRevision } from '../engine/restore';
import { validateCommand, templateDocSchema } from '../engine/validate';
import type { EditCommand, InsertCommand, RevisionEntry, SetStyleCommand } from '../types/commands';
import type { TemplateDoc } from '../types/template';
import { initializeTemplateYDoc, projectDoc } from './schema';
import { applyCommandToYDoc } from './commandAdapter';
import type { ApplyOptions } from './commandAdapter';
import { commandsFromRevision } from './commands';

const doc = (): TemplateDoc => createDefaultTemplate();

const makeYDoc = (d: TemplateDoc): Y.Doc => {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, d);
  return ydoc;
};

const fixedNow = (): number => 1700000000000;

const authoritative = (commandId: string): ApplyOptions => ({
  origin: 'authoritative',
  commandId,
  now: fixedNow,
});

const stripRevision = (d: TemplateDoc) => {
  const { revision: _r, ...rest } = d;
  return rest;
};

const applyAll = (commands: EditCommand[]): { after: TemplateDoc; entry: RevisionEntry } => {
  let current = doc();
  let entry: RevisionEntry | null = null;
  for (const command of commands) {
    const result = applyCommand(current, command);
    current = result.doc;
    entry = result.revisions[result.revisions.length - 1] ?? entry;
  }
  if (!entry) throw new Error('arrangement produced no revision entry');
  return { after: current, entry };
};

const expectRoundTrip = (after: TemplateDoc, entry: RevisionEntry): EditCommand[] => {
  const commands = commandsFromRevision(after, entry);
  expect(commands.length).toBeGreaterThan(0);

  let scratch = after;
  for (const command of commands) {
    expect(validateCommand(scratch, command)).toEqual([]);
    scratch = applyCommand(scratch, command).doc;
  }

  const ydoc = makeYDoc(after);
  commands.forEach((command, i) => {
    applyCommandToYDoc(ydoc, command, authoritative(`undo-${i}`));
  });

  const projected = projectDoc(ydoc);
  const oracle = restoreRevision(after, entry).doc;
  expect(stripRevision(projected)).toEqual(stripRevision(oracle));
  return commands;
};

describe('commandsFromRevision', () => {
  it('inverts base set-content back to the prior content', () => {
    const { after, entry } = applyAll([
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        content: { text: 'Hello' },
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      kind: 'set-content',
      source: 'restore',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: entry.before.content,
    });
  });

  it('inverts a second viewport override back to the first', () => {
    const { after, entry } = applyAll([
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['hero-eyebrow'],
        scope: 'mobile',
        content: { text: 'First mobile' },
      },
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['hero-eyebrow'],
        scope: 'mobile',
        content: { text: 'Second mobile' },
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands[0]).toMatchObject({
      kind: 'set-content',
      scope: 'mobile',
      content: { text: 'First mobile' },
    });
  });

  it('returns no commands for a first viewport override (override delete is not expressible)', () => {
    const { after, entry } = applyAll([
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['hero-eyebrow'],
        scope: 'mobile',
        content: { text: 'Only mobile' },
      },
    ]);
    expect(commandsFromRevision(after, entry)).toEqual([]);
  });

  it('maps null style values to null deletions when inverting set-style', () => {
    const { after, entry } = applyAll([
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-eyebrow'],
        scope: 'all',
        stylePatch: { fontSize: undefined, color: '#111111' },
      },
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-eyebrow'],
        scope: 'all',
        stylePatch: { fontSize: 20, color: '#111111' },
      },
    ]);
    expect(entry.before.style).toEqual({ fontSize: null, color: '#111111' });
    const commands = expectRoundTrip(after, entry);
    expect(commands).toHaveLength(1);
    const patch = (commands[0] as SetStyleCommand).stylePatch;
    expect(patch.color).toBe('#111111');
    expect('fontSize' in patch).toBe(true);
    expect(patch.fontSize).toBeNull();
  });

  it('keeps null deletions JSON-safe and deletes the key through the Y adapter', () => {
    const ydoc = makeYDoc(doc());
    const applied = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        stylePatch: { color: '#112233' },
      },
      authoritative('cmd-null-delete-1'),
    );
    expect(applied.entries[0].before.style).toEqual({ color: null });

    const inverse = commandsFromRevision(projectDoc(ydoc), applied.entries[0]);
    expect(inverse).toHaveLength(1);
    const wire = JSON.parse(JSON.stringify(inverse)) as EditCommand[];
    expect((wire[0] as SetStyleCommand).stylePatch).toEqual({ color: null });

    wire.forEach((command, i) => {
      applyCommandToYDoc(ydoc, command, authoritative(`cmd-null-delete-undo-${i}`));
    });
    const projected = projectDoc(ydoc);
    const base = projected.elements['hero-heading'].style.base;
    expect('color' in base).toBe(false);
    expect(templateDocSchema.safeParse(projected).success).toBe(true);
  });

  it('inverts set-style viewport overrides back to the prior value', () => {
    const { after, entry } = applyAll([
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-cta'],
        scope: 'tablet',
        stylePatch: { paddingX: 8 },
      },
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-cta'],
        scope: 'tablet',
        stylePatch: { paddingX: 24 },
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands[0]).toMatchObject({
      kind: 'set-style',
      scope: 'tablet',
      stylePatch: { paddingX: 8 },
    });
  });

  it('inverts reorder back to the previous index', () => {
    const { after, entry } = applyAll([
      {
        kind: 'reorder',
        source: 'canvas',
        targetIds: ['hero-subtext'],
        scope: 'all',
        index: 0,
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands[0]).toMatchObject({
      kind: 'reorder',
      targetIds: ['hero-subtext'],
      index: entry.structural?.previousIndex,
    });
  });

  it('inverts insert by removing the inserted element', () => {
    const { after, entry } = applyAll([
      {
        kind: 'insert',
        source: 'canvas',
        targetIds: [],
        scope: 'all',
        parentId: 'hero-section',
        index: 2,
        element: {
          id: 'new-paragraph',
          type: 'text',
          parentId: 'hero-section',
          childIds: [],
          content: { base: { text: 'Fresh' } },
          style: { base: {} },
        },
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands[0]).toMatchObject({ kind: 'remove', targetIds: ['new-paragraph'] });
  });

  it('inverts remove of a leaf by re-inserting it at the captured index', () => {
    const { after, entry } = applyAll([
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['hero-cta'],
        scope: 'all',
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      kind: 'insert',
      parentId: 'hero-section',
      index: entry.structural?.index,
    });
    expect((commands[0] as InsertCommand).element.id).toBe('hero-cta');
    expect((commands[0] as InsertCommand).element.childIds).toEqual([]);
  });

  it('inverts remove of a subtree into parent-first inserts', () => {
    const { after, entry } = applyAll([
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['feature-card-1'],
        scope: 'all',
      },
    ]);
    const commands = expectRoundTrip(after, entry);
    expect(commands.map((c) => (c.kind === 'insert' ? c.element.id : ''))).toEqual([
      'feature-card-1',
      'feature-1-title',
      'feature-1-text',
    ]);
    for (const command of commands) {
      expect((command as InsertCommand).element.childIds).toEqual([]);
    }
  });

  it('returns no commands when the inverted element no longer exists', () => {
    const applied = applyCommand(doc(), {
      kind: 'insert',
      source: 'canvas',
      targetIds: [],
      scope: 'all',
      parentId: 'hero-section',
      index: 2,
      element: {
        id: 'new-paragraph',
        type: 'text',
        parentId: 'hero-section',
        childIds: [],
        content: { base: { text: 'Fresh' } },
        style: { base: {} },
      },
    });
    const gone = applyCommand(applied.doc, {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['new-paragraph'],
      scope: 'all',
    }).doc;
    expect(commandsFromRevision(gone, applied.revisions[0])).toEqual([]);
  });

  it('returns no commands when the removed root was already re-added', () => {
    const applied = applyCommand(doc(), {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1'],
      scope: 'all',
    });
    const entry = applied.revisions[0];
    const root = entry.structural?.removedSubtree?.[0];
    if (!root) throw new Error('expected captured subtree');
    const reAdded = applyCommand(applied.doc, {
      kind: 'insert',
      source: 'canvas',
      targetIds: [],
      scope: 'all',
      parentId: 'features-section',
      index: 1,
      element: root,
    }).doc;
    expect(commandsFromRevision(reAdded, entry)).toEqual([]);
  });
});

describe('commandsFromRevision on Y adapter entries', () => {
  it('inverts an authoritative adapter entry and matches the immer oracle on the same ydoc', () => {
    const ydoc = makeYDoc(doc());
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        stylePatch: { color: '#111111', fontSize: 72 },
      },
      authoritative('cmd-1'),
    );
    expect(result.entries).toHaveLength(1);

    const after = projectDoc(ydoc);
    const entry = result.entries[0];
    const commands = commandsFromRevision(after, entry);
    expect(commands).toHaveLength(1);
    for (const command of commands) {
      expect(validateCommand(after, command)).toEqual([]);
    }

    commands.forEach((command, i) => {
      applyCommandToYDoc(ydoc, command, authoritative(`undo-${i}`));
    });

    const projected = projectDoc(ydoc);
    const oracle = restoreRevision(after, { ...entry }).doc;
    expect(stripRevision(projected)).toEqual(stripRevision(oracle));
  });
});
