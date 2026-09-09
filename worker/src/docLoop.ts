import type * as Y from 'yjs';
import type { EditCommand } from '@app/types/commands';
import type { CommandError } from '@app/engine/validate';
import { zodErrorToCommandErrors } from '@app/engine/validate';
import { commandFrameSchema } from '@app/collab/frames';
import type { AckFrame, RejectFrame } from '@app/collab/frames';
import { applyCommandToYDoc, projectDoc, validateCommand } from './validate';

export const DEDUPE_CAPACITY = 512;

export interface DedupeSet {
  get(id: string): number | undefined;
  add(id: string, seq: number): void;
  entries(): [string, number][];
}

export function createDedupeSet(capacity: number = DEDUPE_CAPACITY): DedupeSet {
  const map = new Map<string, number>();
  return {
    get: (id) => map.get(id),
    add: (id, seq) => {
      map.delete(id);
      map.set(id, seq);
      while (map.size > capacity) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
    },
    entries: () => [...map.entries()],
  };
}

export interface DocLoopState {
  ydoc: Y.Doc;
  serverSeq: number;
  seen: DedupeSet;
}

export interface DocLoopMeta {
  serverSeq: number;
  dedupe: [string, number][];
}

export function serializeDocLoopMeta(state: DocLoopState): string {
  return JSON.stringify({ serverSeq: state.serverSeq, dedupe: state.seen.entries() });
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseDocLoopMeta(raw: unknown): DocLoopMeta | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as { serverSeq?: unknown; dedupe?: unknown };
  if (!isNonNegativeInt(candidate.serverSeq)) return null;
  if (!Array.isArray(candidate.dedupe)) return null;
  const dedupe: [string, number][] = [];
  for (const entry of candidate.dedupe) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [id, seq] = entry;
    if (typeof id !== 'string' || id.length === 0 || !isNonNegativeInt(seq)) return null;
    dedupe.push([id, seq]);
  }
  return { serverSeq: candidate.serverSeq, dedupe };
}

export function dedupeFromEntries(entries: [string, number][], capacity?: number): DedupeSet {
  const seen = createDedupeSet(capacity);
  for (const [id, seq] of entries) seen.add(id, seq);
  return seen;
}

export type CommandDecision =
  | { action: 'drop' }
  | { action: 'reject'; commandId: string; errors: CommandError[] }
  | { action: 'apply'; commandId: string; command: EditCommand };

function extractCommandId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const commandId = (data as { commandId?: unknown }).commandId;
  return typeof commandId === 'string' && commandId.length > 0 ? commandId : null;
}

export function decideCommandFrame(data: unknown): CommandDecision {
  const parsed = commandFrameSchema.safeParse(data);
  if (!parsed.success) {
    const commandId = extractCommandId(data);
    if (commandId === null) return { action: 'drop' };
    return { action: 'reject', commandId, errors: zodErrorToCommandErrors(parsed.error) };
  }
  return { action: 'apply', commandId: parsed.data.commandId, command: parsed.data.command };
}

export type CommandResponse = AckFrame | RejectFrame;

export function processCommand(
  state: DocLoopState,
  decision: CommandDecision,
): CommandResponse | null {
  if (decision.action === 'drop') return null;
  if (decision.action === 'reject') {
    return { v: 1, type: 'reject', commandId: decision.commandId, errors: decision.errors };
  }
  const { commandId, command } = decision;
  const previousSeq = state.seen.get(commandId);
  if (previousSeq !== undefined) {
    return { v: 1, type: 'ack', commandId, serverSeq: previousSeq };
  }
  const errors = validateCommand(projectDoc(state.ydoc), command);
  if (errors.length > 0) {
    return { v: 1, type: 'reject', commandId, errors };
  }
  const serverSeq = state.serverSeq + 1;
  applyCommandToYDoc(state.ydoc, command, {
    origin: 'authoritative',
    commandId,
    serverSeq,
  });
  state.serverSeq = serverSeq;
  state.seen.add(commandId, serverSeq);
  return { v: 1, type: 'ack', commandId, serverSeq };
}
