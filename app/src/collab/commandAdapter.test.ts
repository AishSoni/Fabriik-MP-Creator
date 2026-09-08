import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { applyCommand } from '../engine/commit';
import type { EditCommand, RevisionEntry } from '../types/commands';
import type { TemplateDoc, TemplateElement } from '../types/template';
import {
  HISTORY_KEY,
  TRANSACTION_ORIGIN,
  getHistoryYArray,
  initializeTemplateYDoc,
  projectDoc,
} from './schema';
import { applyCommandToYDoc, replaceYDoc } from './commandAdapter';
import type { ApplyOptions, CollabRevisionEntry } from './commandAdapter';
import { validateTemplateSemantics } from '../engine/validate';

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

const makePairedDocs = (): [Y.Doc, Y.Doc] => {
  const base = new Y.Doc();
  initializeTemplateYDoc(base, doc());
  const seed = Y.encodeStateAsUpdate(base);
  const a = new Y.Doc();
  const b = new Y.Doc();
  Y.applyUpdate(a, seed);
  Y.applyUpdate(b, seed);
  return [a, b];
};

const syncPair = (a: Y.Doc, b: Y.Doc, rounds = 2): void => {
  for (let i = 0; i < rounds; i += 1) {
    const svA = Y.encodeStateVector(a);
    const svB = Y.encodeStateVector(b);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, svA));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, svB));
  }
};

describe('convergence', () => {

  const optimistic = (commandId: string): ApplyOptions => ({
    origin: 'optimistic',
    commandId,
    now: fixedNow,
  });

  const styleCommand = (color: string): EditCommand => ({
    kind: 'set-style',
    source: 'canvas',
    targetIds: ['hero-heading'],
    scope: 'all',
    baseRevision: 0,
    stylePatch: { color },
  });

  const contentCommand = (text: string): EditCommand => ({
    kind: 'set-content',
    source: 'code',
    targetIds: ['footer-text'],
    scope: 'all',
    baseRevision: 0,
    content: { text },
  });

  it('converges when the same commands are applied in different orders', () => {
    const [a, b] = makePairedDocs();

    applyCommandToYDoc(a, styleCommand('#111111'), optimistic('cmd-a1'));
    applyCommandToYDoc(a, contentCommand('From A'), optimistic('cmd-a2'));
    applyCommandToYDoc(b, contentCommand('From A'), optimistic('cmd-b1'));
    applyCommandToYDoc(b, styleCommand('#111111'), optimistic('cmd-b2'));

    syncPair(a, b);

    expect(projectDoc(a)).toEqual(projectDoc(b));
  });

  it('merges disjoint edits so both survive', () => {
    const [a, b] = makePairedDocs();

    applyCommandToYDoc(a, styleCommand('#101010'), optimistic('cmd-a1'));
    applyCommandToYDoc(b, contentCommand('Disjoint footer'), optimistic('cmd-b1'));

    syncPair(a, b);

    const projected = projectDoc(a);
    expect(projected).toEqual(projectDoc(b));
    expect(projected.elements['hero-heading'].style.base.color).toBe('#101010');
    expect(projected.elements['footer-text'].content.base).toEqual({ text: 'Disjoint footer' });
  });

  it('resolves concurrent same-key writes to one shared winner', () => {
    const [a, b] = makePairedDocs();

    applyCommandToYDoc(a, styleCommand('#111111'), optimistic('cmd-a1'));
    applyCommandToYDoc(b, styleCommand('#222222'), optimistic('cmd-b1'));

    syncPair(a, b);

    const projectedA = projectDoc(a);
    expect(projectedA).toEqual(projectDoc(b));
    const winner = projectedA.elements['hero-heading'].style.base.color;
    expect(['#111111', '#222222']).toContain(winner);
  });

  it('lets a post-sync write deterministically win the next round', () => {
    const [a, b] = makePairedDocs();

    applyCommandToYDoc(a, styleCommand('#111111'), optimistic('cmd-a1'));
    applyCommandToYDoc(b, styleCommand('#222222'), optimistic('cmd-b1'));
    syncPair(a, b);

    applyCommandToYDoc(b, styleCommand('#333333'), optimistic('cmd-b2'));
    syncPair(a, b);

    const projectedA = projectDoc(a);
    expect(projectedA).toEqual(projectDoc(b));
    expect(projectedA.elements['hero-heading'].style.base.color).toBe('#333333');
  });

  it('survives a concurrent reorder and remove without throwing or diverging', () => {
    const [a, b] = makePairedDocs();

    const reorder: EditCommand = {
      kind: 'reorder',
      source: 'canvas',
      targetIds: ['hero-subtext'],
      scope: 'all',
      baseRevision: 0,
      index: 0,
    };
    const remove: EditCommand = {
      kind: 'remove',
      source: 'canvas',
      targetIds: ['hero-subtext'],
      scope: 'all',
      baseRevision: 0,
    };

    expect(() => {
      applyCommandToYDoc(a, reorder, optimistic('cmd-a1'));
      applyCommandToYDoc(b, remove, optimistic('cmd-b1'));
      syncPair(a, b);
    }).not.toThrow();

    expect(projectDoc(a)).toEqual(projectDoc(b));
  });
});

describe('replaceYDoc', () => {
  const replacedDoc = (): TemplateDoc => ({
    templateId: 'tpl-replaced-v1',
    templateName: 'Replaced Template',
    revision: 7,
    rootId: 'replaced-root',
    elements: {
      'replaced-root': {
        id: 'replaced-root',
        type: 'section',
        parentId: null,
        childIds: ['replaced-heading'],
        content: { base: {} },
        style: { base: {} },
      },
      'replaced-heading': {
        id: 'replaced-heading',
        type: 'heading',
        parentId: 'replaced-root',
        childIds: [],
        content: { base: { text: 'Fresh heading' } },
        style: { base: { fontSize: 40 } },
      },
    },
  });

  const seedHistory = (ydoc: Y.Doc): void => {
    applyCommandToYDoc(
      ydoc,
      {
        kind: 'set-content',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        baseRevision: 0,
        content: { text: 'Seeded' },
      },
      authoritative(),
    );
  };

  it('rebuilds elements and meta in one transaction and clears history', () => {
    const ydoc = makeYDoc();
    seedHistory(ydoc);
    expect(getHistoryYArray(ydoc).length).toBeGreaterThan(0);

    let ticks = 0;
    ydoc.on('afterTransaction', () => {
      ticks += 1;
    });

    const result = replaceYDoc(ydoc, replacedDoc());

    expect(ticks).toBe(1);
    expect(getHistoryYArray(ydoc).length).toBe(0);
    expect(result.entries).toEqual([]);
    expect(result.changedElementIds).toEqual(['replaced-root', 'replaced-heading']);

    const projected = projectDoc(ydoc);
    expect(stripDoc(projected)).toEqual(stripDoc(replacedDoc()));
    expect(validateTemplateSemantics(projected)).toEqual([]);
  });

  it('propagates the swap to a synced peer, clearing peer history too', () => {
    const [a, b] = makePairedDocs();
    seedHistory(a);
    seedHistory(b);

    syncPair(a, b);

    replaceYDoc(a, replacedDoc());
    syncPair(a, b);

    expect(projectDoc(b)).toEqual(projectDoc(a));
    expect(stripDoc(projectDoc(b))).toEqual(stripDoc(replacedDoc()));
    expect(getHistoryYArray(b).length).toBe(0);
    expect(getHistoryYArray(a).length).toBe(0);
  });
});
