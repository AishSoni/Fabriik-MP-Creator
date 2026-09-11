import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '@app/template/defaultTemplate';
import { getHistoryYArray, initializeTemplateYDoc, projectDoc } from '@app/collab/schema';
import { decodeControlEnvelope, encodeControlFrame } from '@app/collab/frames';
import { createDedupeSet, decideCommandFrame, dedupeFromEntries, parseDocLoopMeta, processCommand, serializeDocLoopMeta } from './docLoop';
import type { DocLoopState } from './docLoop';

const makeState = (): DocLoopState => {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, createDefaultTemplate());
  return { ydoc, serverSeq: 0, seen: createDedupeSet() };
};

const setStyle = (commandId: string) => ({
  v: 1 as const,
  commandId,
  command: {
    kind: 'set-style' as const,
    source: 'canvas' as const,
    targetIds: ['hero-heading'],
    scope: 'all' as const,
    stylePatch: { color: '#112233' },
  },
});

const reorderGhost = (commandId: string) => ({
  v: 1 as const,
  commandId,
  command: {
    kind: 'reorder' as const,
    source: 'canvas' as const,
    targetIds: ['ghost'],
    scope: 'all' as const,
    index: 0,
  },
});

const run = (state: DocLoopState, envelope: unknown) =>
  processCommand(state, decideCommandFrame(envelope));

describe('doc loop: decision', () => {
  it('drops payloads without a usable commandId', () => {
    expect(decideCommandFrame(null)).toEqual({ action: 'drop' });
    expect(decideCommandFrame('junk')).toEqual({ action: 'drop' });
    expect(decideCommandFrame({ v: 1 })).toEqual({ action: 'drop' });
    expect(decideCommandFrame({ v: 1, commandId: '' })).toEqual({ action: 'drop' });
    expect(processCommand(makeState(), { action: 'drop' })).toBeNull();
  });

  it('rejects schema-invalid envelopes carrying a commandId', () => {
    const decision = decideCommandFrame({ v: 1, commandId: 'c9', command: { kind: 'nope' } });
    expect(decision.action).toBe('reject');
    if (decision.action !== 'reject') throw new Error('unreachable');
    expect(decision.commandId).toBe('c9');
    expect(decision.errors.length).toBeGreaterThan(0);
    expect(decision.errors.every((e) => e.code === 'invalid-payload')).toBe(true);
  });

  it('accepts valid envelopes for apply', () => {
    const decision = decideCommandFrame(setStyle('c1'));
    expect(decision).toMatchObject({ action: 'apply', commandId: 'c1' });
  });
});

describe('doc loop: authoritative apply', () => {
  it('applies a valid command, acks with seq 1 and appends history once', () => {
    const state = makeState();
    expect(getHistoryYArray(state.ydoc).length).toBe(0);
    const response = run(state, setStyle('cmd-1'));
    expect(response).toEqual({ v: 1, type: 'ack', commandId: 'cmd-1', serverSeq: 1 });
    expect(state.serverSeq).toBe(1);
    expect(getHistoryYArray(state.ydoc).length).toBe(1);
    expect(JSON.stringify(projectDoc(state.ydoc))).toContain('#112233');
  });

  it('re-acks duplicates with the original seq without re-applying', () => {
    const state = makeState();
    expect(run(state, setStyle('cmd-1'))).toMatchObject({ serverSeq: 1 });
    expect(run(state, setStyle('cmd-2'))).toMatchObject({ serverSeq: 2 });
    expect(run(state, setStyle('cmd-1'))).toEqual({ v: 1, type: 'ack', commandId: 'cmd-1', serverSeq: 1 });
    expect(state.serverSeq).toBe(2);
    expect(getHistoryYArray(state.ydoc).length).toBe(2);
  });

  it('rejects unknown elements sender-only without touching state', () => {
    const state = makeState();
    const response = run(state, reorderGhost('cmd-x'));
    expect(response?.type).toBe('reject');
    if (!response || response.type !== 'reject') throw new Error('unreachable');
    expect(response.errors[0]?.code).toBe('unknown-element');
    expect(state.serverSeq).toBe(0);
    expect(getHistoryYArray(state.ydoc).length).toBe(0);
  });

  it('applies commands regardless of revision', () => {
    const state = makeState();
    const response = run(state, setStyle('cmd-s'));
    if (!response || response.type !== 'ack') throw new Error('expected ack, got reject');
    expect(response.serverSeq).toBe(1);
    expect(getHistoryYArray(state.ydoc).length).toBe(1);
  });

  it('does not remember rejected commandIds', () => {
    const state = makeState();
    expect(run(state, reorderGhost('cmd-x'))?.type).toBe('reject');
    expect(run(state, reorderGhost('cmd-x'))?.type).toBe('reject');
    expect(state.seen.entries()).toEqual([]);
  });
});

describe('dedupe set', () => {
  it('evicts oldest beyond capacity', () => {
    const seen = createDedupeSet(2);
    seen.add('a', 1);
    seen.add('b', 2);
    seen.add('c', 3);
    expect(seen.get('a')).toBeUndefined();
    expect(seen.get('b')).toBe(2);
    expect(seen.get('c')).toBe(3);
    expect(seen.entries()).toEqual([['b', 2], ['c', 3]]);
  });

  it('refreshes recency on re-add', () => {
    const seen = createDedupeSet(2);
    seen.add('a', 1);
    seen.add('b', 2);
    seen.add('a', 1);
    seen.add('c', 3);
    expect(seen.get('a')).toBe(1);
    expect(seen.get('b')).toBeUndefined();
  });
});

describe('doc loop: full wire path', () => {
  it('decodes encoded client bytes and processes them', () => {
    const state = makeState();
    const bytes = encodeControlFrame(setStyle('cmd-wire'));
    const envelope = decodeControlEnvelope(bytes);
    const response = processCommand(state, decideCommandFrame(envelope?.data ?? null));
    expect(response).toEqual({ v: 1, type: 'ack', commandId: 'cmd-wire', serverSeq: 1 });
    expect(JSON.stringify(projectDoc(state.ydoc))).toContain('#112233');
  });

  it('feed Y.Doc updates through the live document instance', () => {
    const state = makeState();
    run(state, setStyle('cmd-1'));
    let observed = 0;
    state.ydoc.on('update', () => {
      observed += 1;
    });
    run(state, setStyle('cmd-2'));
    expect(observed).toBeGreaterThan(0);
  });
});

describe('doc loop meta persistence', () => {
  it('round-trips state meta through serialize/parse', () => {
    const state = makeState();
    run(state, setStyle('cmd-1'));
    run(state, setStyle('cmd-2'));
    const parsed = parseDocLoopMeta(JSON.parse(serializeDocLoopMeta(state)));
    expect(parsed).toEqual({ serverSeq: 2, dedupe: [['cmd-1', 1], ['cmd-2', 2]] });
  });

  it('returns null for malformed meta', () => {
    expect(parseDocLoopMeta(null)).toBeNull();
    expect(parseDocLoopMeta('junk')).toBeNull();
    expect(parseDocLoopMeta({})).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: -1, dedupe: [] })).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: 1.5, dedupe: [] })).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: 1, dedupe: 'nope' })).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: 1, dedupe: [['a']] })).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: 1, dedupe: [[1, 2]] })).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: 1, dedupe: [['', 2]] })).toBeNull();
    expect(parseDocLoopMeta({ serverSeq: 1, dedupe: [['a', -3]] })).toBeNull();
  });

  it('rebuilds a dedupe set from persisted entries', () => {
    const seen = dedupeFromEntries([['a', 1], ['b', 2]]);
    expect(seen.get('a')).toBe(1);
    expect(seen.get('b')).toBe(2);
    expect(seen.entries()).toEqual([['a', 1], ['b', 2]]);
  });

  it('respects capacity when rebuilding from entries', () => {
    const seen = dedupeFromEntries([['a', 1], ['b', 2], ['c', 3]], 2);
    expect(seen.get('a')).toBeUndefined();
    expect(seen.entries()).toEqual([['b', 2], ['c', 3]]);
  });

  it('hydrated state re-acks duplicates with original seq and continues seq numbering', () => {
    const state = makeState();
    expect(run(state, setStyle('cmd-1'))).toMatchObject({ serverSeq: 1 });
    expect(run(state, setStyle('cmd-2'))).toMatchObject({ serverSeq: 2 });
    const meta = parseDocLoopMeta(JSON.parse(serializeDocLoopMeta(state)));
    expect(meta).not.toBeNull();
    if (!meta) throw new Error('unreachable');
    const snapshot = Y.encodeStateAsUpdate(state.ydoc);
    const wokeDoc = new Y.Doc();
    Y.applyUpdate(wokeDoc, snapshot);
    const wokeState: DocLoopState = {
      ydoc: wokeDoc,
      serverSeq: meta.serverSeq,
      seen: dedupeFromEntries(meta.dedupe),
    };
    expect(getHistoryYArray(wokeState.ydoc).length).toBe(2);
    expect(run(wokeState, setStyle('cmd-1'))).toEqual({ v: 1, type: 'ack', commandId: 'cmd-1', serverSeq: 1 });
    expect(getHistoryYArray(wokeState.ydoc).length).toBe(2);
    expect(run(wokeState, setStyle('cmd-3'))).toMatchObject({ serverSeq: 3 });
    expect(getHistoryYArray(wokeState.ydoc).length).toBe(3);
  });
});
