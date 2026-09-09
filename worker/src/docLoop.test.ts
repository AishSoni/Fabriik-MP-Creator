import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '@app/template/defaultTemplate';
import { getHistoryYArray, initializeTemplateYDoc, projectDoc } from '@app/collab/schema';
import { decodeControlEnvelope, encodeControlFrame } from '@app/collab/frames';
import { createDedupeSet, decideCommandFrame, processCommand } from './docLoop';
import type { DocLoopState } from './docLoop';

const makeState = (): DocLoopState => {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, createDefaultTemplate());
  return { ydoc, serverSeq: 0, seen: createDedupeSet() };
};

const setStyle = (commandId: string, baseRevision = 0) => ({
  v: 1 as const,
  commandId,
  command: {
    kind: 'set-style' as const,
    source: 'canvas' as const,
    targetIds: ['hero-heading'],
    scope: 'all' as const,
    baseRevision,
    stylePatch: { color: '#112233' },
  },
});

const reorderGhost = (commandId: string, baseRevision = 0) => ({
  v: 1 as const,
  commandId,
  command: {
    kind: 'reorder' as const,
    source: 'canvas' as const,
    targetIds: ['ghost'],
    scope: 'all' as const,
    baseRevision,
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

  it('rejects stale revisions', () => {
    const state = makeState();
    const response = run(state, setStyle('cmd-s', 5));
    if (!response || response.type !== 'reject') throw new Error('unreachable');
    expect(response.errors[0]?.code).toBe('stale-revision');
    expect(state.serverSeq).toBe(0);
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
