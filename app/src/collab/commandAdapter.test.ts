import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { applyCommand } from '../engine/commit';
import type { EditCommand, RevisionEntry } from '../types/commands';
import type { TemplateDoc, TemplateElement } from '../types/template';
import {
  HISTORY_KEY,
  TRANSACTION_ORIGIN,
  initializeTemplateYDoc,
  projectDoc,
} from './schema';
import { applyCommandToYDoc } from './commandAdapter';
import type { ApplyOptions, CollabRevisionEntry } from './commandAdapter';

const doc = (): TemplateDoc => createDefaultTemplate();

const makeYDoc = (d: TemplateDoc = doc()): Y.Doc => {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, d);
  return ydoc;
};

const fixedNow = (): number => 1700000000000;

const authoritative = (overrides: Partial<ApplyOptions> = {}): ApplyOptions => ({
  origin: 'authoritative',
  commandId: 'cmd-test-1',
  now: fixedNow,
  ...overrides,
});

const stripEntry = (entry: RevisionEntry | CollabRevisionEntry) => {
  const { id: _id, commandId: _c, baseRevision: _b, timestamp: _t, ...rest } = entry as RevisionEntry & CollabRevisionEntry;
  return rest;
};

const stripDoc = (d: TemplateDoc) => {
  const { revision: _r, ...rest } = d;
  return rest;
};

interface ParityCase {
  name: string;
  command: EditCommand;
}

const parityCases: ParityCase[] = [
  {
    name: 'set-content scope all',
    command: {
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: 0,
      content: { text: 'Hello collab' },
    },
  },
  {
    name: 'set-content viewport without prior override',
    command: {
      kind: 'set-content',
      source: 'code',
      targetIds: ['hero-eyebrow'],
      scope: 'mobile',
      baseRevision: 0,
      content: { text: 'Mobile eyebrow' },
    },
  },
  {
    name: 'set-content nav with array payload',
    command: {
      kind: 'set-content',
      source: 'code',
      targetIds: ['top-nav'],
      scope: 'all',
      baseRevision: 0,
      content: {
        brand: 'Renamed',
        links: [{ label: 'Docs', href: '#docs' }],
      },
    },
  },
  {
    name: 'set-style multi target scope all',
    command: {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading', 'hero-subtext'],
      scope: 'all',
      baseRevision: 0,
      stylePatch: { color: '#ff0000', fontSize: 64 },
    },
  },
  {
    name: 'set-style viewport creates override layer',
    command: {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-cta'],
      scope: 'tablet',
      baseRevision: 0,
      stylePatch: { paddingX: 8, borderRadius: 4 },
    },
  },
  {
    name: 'set-style with undefined resets key to null in snapshot',
    command: {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-eyebrow'],
      scope: 'all',
      baseRevision: 0,
      stylePatch: { marginBottom: undefined, marginTop: 4 },
    },
  },
  {
    name: 'reorder within parent',
    command: {
      kind: 'reorder',
      source: 'canvas',
      targetIds: ['hero-subtext'],
      scope: 'all',
      baseRevision: 0,
      index: 0,
    },
  },
  {
    name: 'reorder clamps out-of-range index',
    command: {
      kind: 'reorder',
      source: 'canvas',
      targetIds: ['hero-subtext'],
      scope: 'all',
      baseRevision: 0,
      index: 999,
    },
  },
  {
    name: 'insert leaf element',
    command: {
      kind: 'insert',
      source: 'canvas',
      targetIds: [],
      scope: 'all',
      baseRevision: 0,
      parentId: 'hero-section',
      index: 2,
      element: {
        id: 'new-paragraph',
        type: 'text',
        parentId: 'hero-section',
        childIds: [],
        content: { base: { text: 'Fresh paragraph' } },
        style: { base: { fontSize: 18 } },
      },
    },
  },
  {
    name: 'insert clamps out-of-range index',
    command: {
      kind: 'insert',
      source: 'canvas',
      targetIds: [],
      scope: 'all',
      baseRevision: 0,
      parentId: 'footer-section',
      index: 999,
      element: {
        id: 'footer-extra',
        type: 'text',
        parentId: 'footer-section',
        childIds: [],
        content: { base: { text: 'Extra' } },
        style: { base: {} },
      },
    },
  },
  {
    name: 'insert with dangling childIds mid-stream',
    command: {
      kind: 'insert',
      source: 'code',
      targetIds: [],
      scope: 'all',
      baseRevision: 0,
      parentId: 'features-section',
      index: 0,
      element: {
        id: 'stream-card',
        type: 'section',
        parentId: 'features-section',
        childIds: ['stream-card-title'],
        content: { base: {} },
        style: { base: {} },
      },
    },
  },
  {
    name: 'remove subtree',
    command: {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1'],
      scope: 'all',
      baseRevision: 0,
    },
  },
  {
    name: 'remove multiple disjoint targets',
    command: {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['feature-card-1', 'testimonial-quote'],
      scope: 'all',
      baseRevision: 0,
    },
  },
];

describe('parity oracle vs engine/commit.ts', () => {
  for (const { name, command } of parityCases) {
    it(`matches immer engine for: ${name}`, () => {
      const plain = doc();
      const committed = applyCommand(plain, command);

      const ydoc = makeYDoc();
      const result = applyCommandToYDoc(ydoc, command, authoritative());

      expect(stripDoc(projectDoc(ydoc))).toEqual(stripDoc(committed.doc));
      expect(result.entries.map(stripEntry)).toEqual(committed.revisions.map(stripEntry));
    });
  }

  it('adapter and engine agree on labels and kinds', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'ai',
        targetIds: ['hero-heading'],
        scope: 'all',
        baseRevision: 0,
        stylePatch: { color: '#123456' },
      },
      authoritative(),
    );
    expect(result.entries[0].label).toBe('style updated (ai-accepted)');
    expect(result.entries[0].kind).toBe('ai-accepted');
  });
});

describe('entry contract', () => {
  it('stamps commandId, optional serverSeq, rev- ids, and injected timestamps', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading', 'hero-subtext'],
        scope: 'all',
        baseRevision: 0,
        stylePatch: { color: '#00ff00' },
      },
      authoritative({ commandId: 'cmd-xyz', serverSeq: 42 }),
    );

    expect(result.entries).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.commandId).toBe('cmd-xyz');
      expect(entry.serverSeq).toBe(42);
      expect(entry.id).toMatch(/^rev-[0-9a-z]+-[0-9a-z]+$/);
      expect(entry.timestamp).toBe(fixedNow());
      expect('baseRevision' in entry && entry.baseRevision !== undefined).toBe(false);
    }
    const ids = result.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('omits serverSeq when not provided', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['footer-text'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Updated footer' },
      },
      authoritative(),
    );
    expect(result.entries[0].serverSeq).toBeUndefined();
    expect('serverSeq' in result.entries[0]).toBe(true);
  });
});

describe('history gating', () => {
  it('optimistic applies return entries but never append history', () => {
    const ydoc = makeYDoc();
    const before = ydoc.getArray(HISTORY_KEY).length;
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['footer-text'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Optimistic footer' },
      },
      authoritative({ origin: 'optimistic' }),
    );
    expect(result.entries).toHaveLength(1);
    expect(ydoc.getArray(HISTORY_KEY).length).toBe(before);
  });

  it('authoritative applies append entries within the same transaction', () => {
    const ydoc = makeYDoc();
    let observedTicks = 0;
    ydoc.on('afterTransaction', () => {
      observedTicks += 1;
    });
    const before = ydoc.getArray(HISTORY_KEY).length;
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'mobile',
        baseRevision: 0,
        stylePatch: { fontSize: 36 },
      },
      authoritative({ serverSeq: 7 }),
    );
    const history = ydoc.getArray(HISTORY_KEY).toJSON() as CollabRevisionEntry[];
    expect(history.length).toBe(before + 1);
    expect(history[history.length - 1]).toEqual(result.entries[0]);
    expect(history[history.length - 1].serverSeq).toBe(7);
    expect(observedTicks).toBe(1);
  });
});

describe('skip and idempotency behavior', () => {
  it('skips missing targets without entries or history', () => {
    const ydoc = makeYDoc();
    const before = ydoc.getArray(HISTORY_KEY).length;
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['no-such-element'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'ghost' },
      },
      authoritative(),
    );
    expect(result.entries).toEqual([]);
    expect(result.changedElementIds).toEqual([]);
    expect(ydoc.getArray(HISTORY_KEY).length).toBe(before);
  });

  it('skips a remove target that disappears earlier in the same command', () => {
    const ydoc = makeYDoc();
    const child = doc().elements['feature-1-title'];
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['feature-card-1', 'feature-1-title'],
        scope: 'all',
        baseRevision: 0,
      },
      authoritative(),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].elementId).toBe('feature-card-1');
    expect(child.parentId).toBe('feature-card-1');
  });

  it('skips remove of the root element (no parentId)', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['page-root'],
        scope: 'all',
        baseRevision: 0,
      },
      authoritative(),
    );
    expect(result.entries).toEqual([]);
  });

  it('skips reorder of parentless elements', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'reorder',
        source: 'canvas',
        targetIds: ['page-root'],
        scope: 'all',
        baseRevision: 0,
        index: 0,
      },
      authoritative(),
    );
    expect(result.entries).toEqual([]);
  });
});

describe('structural snapshots', () => {
  it('remove captures the removed subtree parent-first in DFS order', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['feature-card-1'],
        scope: 'all',
        baseRevision: 0,
      },
      authoritative(),
    );
    const entry = result.entries[0];
    expect(entry.structural?.op).toBe('remove');
    expect(entry.structural?.parentId).toBe('features-section');
    expect(entry.structural?.index).toBe(1);
    expect(entry.structural?.removedSubtree?.map((e: TemplateElement) => e.id)).toEqual([
      'feature-card-1',
      'feature-1-title',
      'feature-1-text',
    ]);
    expect(entry.before.element?.id).toBe('feature-card-1');
    expect(entry.after).toEqual({});
  });

  it('insert records the merged element with forced parentId', () => {
    const ydoc = makeYDoc();
    const result = applyCommandToYDoc(
      ydoc,
      {
        kind: 'insert',
        source: 'canvas',
        targetIds: [],
        scope: 'all',
        baseRevision: 0,
        parentId: 'cta-section',
        index: 0,
        element: {
          id: 'cta-note',
          type: 'text',
          parentId: null,
          childIds: [],
          content: { base: { text: 'Note' } },
          style: { base: {} },
        },
      },
      authoritative(),
    );
    expect(result.entries[0].elementId).toBe('cta-note');
    expect(result.entries[0].after.element?.parentId).toBe('cta-section');
    expect(result.entries[0].structural).toEqual({
      op: 'insert',
      parentId: 'cta-section',
      index: 0,
    });
  });
});

describe('atomicity and transaction origin', () => {
  it('deep observers fire exactly once per command', () => {
    const ydoc = makeYDoc();
    let deepCalls = 0;
    ydoc.getMap('elements').observeDeep(() => {
      deepCalls += 1;
    });
    applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading', 'hero-subtext', 'footer-text'],
        scope: 'all',
        baseRevision: 0,
        stylePatch: { color: '#abcdef' },
      },
      authoritative(),
    );
    expect(deepCalls).toBe(1);
  });

  it('tags transactions with the adapter origin', () => {
    const ydoc = makeYDoc();
    let observedOrigin: unknown = null;
    ydoc.on('afterTransaction', (transaction: Y.Transaction) => {
      observedOrigin = transaction.origin;
    });
    applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['footer-text'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Origin check' },
      },
      authoritative(),
    );
    expect(observedOrigin).toBe(TRANSACTION_ORIGIN);
  });

  it('reports changed element ids per kind', () => {
    const ydoc = makeYDoc();
    const styleResult = applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading', 'hero-subtext'],
        scope: 'all',
        baseRevision: 0,
        stylePatch: { color: '#111111' },
      },
      authoritative(),
    );
    expect(styleResult.changedElementIds).toEqual(['hero-heading', 'hero-subtext']);

    const insertResult = applyCommandToYDoc(
      ydoc,
      {
        kind: 'insert',
        source: 'canvas',
        targetIds: [],
        scope: 'all',
        baseRevision: 0,
        parentId: 'hero-section',
        index: 0,
        element: {
          id: 'tracked-insert',
          type: 'text',
          parentId: 'hero-section',
          childIds: [],
          content: { base: { text: 'x' } },
          style: { base: {} },
        },
      },
      authoritative(),
    );
    expect(insertResult.changedElementIds).toEqual(['tracked-insert', 'hero-section']);

    const removeResult = applyCommandToYDoc(
      ydoc,
      {
        kind: 'remove',
        source: 'canvas',
        targetIds: ['tracked-insert'],
        scope: 'all',
        baseRevision: 0,
      },
      authoritative(),
    );
    expect(removeResult.changedElementIds).toEqual(['tracked-insert', 'hero-section']);
  });
});
