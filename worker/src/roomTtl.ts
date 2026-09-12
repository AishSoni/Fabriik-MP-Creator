export const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PruneDecisionInput {
  lastActiveAt: number | null | undefined;
  now: number;
  connectionCount: number;
  ttlMs?: number;
}

/**
 * A room is pruned only when it has an activity marker that is at least a TTL
 * old and nobody is connected. Rooms without a marker (created before this
 * policy shipped) are rescheduled instead of deleted.
 */
export function shouldPruneRoom(input: PruneDecisionInput): boolean {
  const { lastActiveAt, now, connectionCount, ttlMs = ROOM_TTL_MS } = input;
  if (connectionCount !== 0) return false;
  if (typeof lastActiveAt !== 'number' || !Number.isFinite(lastActiveAt)) return false;
  return now - lastActiveAt >= ttlMs;
}
