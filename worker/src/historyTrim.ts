import type * as Y from 'yjs';
import { getHistoryYArray } from '@app/collab/schema';

export const HISTORY_LIMIT_PER_ELEMENT = 100;
export const HISTORY_TRIM_ORIGIN = 'history-trim';

export function trimHistory(ydoc: Y.Doc, limit: number = HISTORY_LIMIT_PER_ELEMENT): number {
  const history = getHistoryYArray(ydoc);
  const keptPerElement = new Map<string, number>();
  const removals: number[] = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const { elementId } = history.get(index);
    const kept = keptPerElement.get(elementId) ?? 0;
    if (kept < limit) {
      keptPerElement.set(elementId, kept + 1);
    } else {
      removals.push(index);
    }
  }

  if (removals.length === 0) return 0;

  ydoc.transact(() => {
    for (const index of removals) {
      history.delete(index, 1);
    }
  }, HISTORY_TRIM_ORIGIN);

  return removals.length;
}
