import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '@app/template/defaultTemplate';
import { getHistoryYArray, initializeTemplateYDoc, type HistoryEntry } from '@app/collab/schema';
import { HISTORY_LIMIT_PER_ELEMENT, trimHistory } from './historyTrim';

function makeDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, createDefaultTemplate());
  return ydoc;
}

function entry(elementId: string, seq: number): HistoryEntry {
  return {
    id: `rev-${elementId}-${seq}`,
    commandId: `cmd-${seq}`,
    elementId,
    scope: 'all',
    source: 'canvas',
    kind: 'manual',
    label: `entry ${seq}`,
    before: {},
    after: {},
    timestamp: seq,
    serverSeq: seq,
  };
}

function push(ydoc: Y.Doc, entries: HistoryEntry[]): void {
  getHistoryYArray(ydoc).push(entries);
}

function ids(ydoc: Y.Doc): string[] {
  return getHistoryYArray(ydoc)
    .toArray()
    .map((item) => item.id);
}

describe('trimHistory', () => {
  it('caps each element at 100 entries by default', () => {
    expect(HISTORY_LIMIT_PER_ELEMENT).toBe(100);
  });

  it('keeps every entry when no element exceeds the cap', () => {
    const ydoc = makeDoc();
    push(ydoc, [entry('a', 1), entry('a', 2), entry('b', 1), entry('b', 2)]);
    const updates: Uint8Array[] = [];
    ydoc.on('update', (update: Uint8Array) => updates.push(update));

    expect(trimHistory(ydoc, 2)).toBe(0);
    expect(ids(ydoc)).toEqual(['rev-a-1', 'rev-a-2', 'rev-b-1', 'rev-b-2']);
    expect(updates).toHaveLength(0);
  });

  it('evicts the oldest entries per element and leaves siblings untouched', () => {
    const ydoc = makeDoc();
    push(ydoc, [
      entry('a', 1),
      entry('a', 2),
      entry('a', 3),
      entry('a', 4),
      entry('b', 1),
      entry('b', 2),
    ]);

    expect(trimHistory(ydoc, 2)).toBe(2);
    expect(ids(ydoc)).toEqual(['rev-a-3', 'rev-a-4', 'rev-b-1', 'rev-b-2']);
  });

  it('preserves the relative order of interleaved elements', () => {
    const ydoc = makeDoc();
    push(ydoc, [
      entry('a', 1),
      entry('b', 1),
      entry('a', 2),
      entry('b', 2),
      entry('a', 3),
      entry('b', 3),
      entry('a', 4),
      entry('b', 4),
    ]);

    expect(trimHistory(ydoc, 2)).toBe(4);
    expect(ids(ydoc)).toEqual(['rev-a-3', 'rev-b-3', 'rev-a-4', 'rev-b-4']);
  });

  it('emits one update when trimming and is idempotent at the cap', () => {
    const ydoc = makeDoc();
    push(ydoc, [entry('a', 1), entry('a', 2), entry('a', 3), entry('a', 4)]);
    const updates: Uint8Array[] = [];
    ydoc.on('update', (update: Uint8Array) => updates.push(update));

    expect(trimHistory(ydoc, 2)).toBe(2);
    expect(updates).toHaveLength(1);
    expect(trimHistory(ydoc, 2)).toBe(0);
    expect(updates).toHaveLength(1);
    expect(ids(ydoc)).toEqual(['rev-a-3', 'rev-a-4']);
  });
});
