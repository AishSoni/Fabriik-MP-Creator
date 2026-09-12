export const DEFAULT_MAX_ROOM_CONNECTIONS = 16;
export const MIN_MAX_ROOM_CONNECTIONS = 1;
export const MAX_MAX_ROOM_CONNECTIONS = 256;

export function parseMaxRoomConnections(
  raw: string | undefined,
  fallback: number = DEFAULT_MAX_ROOM_CONNECTIONS,
): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const value = Number(trimmed);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(MAX_MAX_ROOM_CONNECTIONS, Math.max(MIN_MAX_ROOM_CONNECTIONS, value));
}

export function isRoomFull(connectionCount: number, maxConnections: number): boolean {
  return connectionCount > maxConnections;
}
