import { useCallback, useRef, useSyncExternalStore } from 'react';
import { resolveIdentityName } from './room';

/**
 * Presence is ephemeral awareness data: never persisted, never validated
 * server-side. Everything in this module treats remote values as untrusted
 * UI hints and sanitizes before rendering (DLD §14).
 */

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

export interface PresenceCursor {
  xPct: number;
  yPct: number;
}

export interface RemotePresence {
  clientId: number;
  user: PresenceUser;
  cursor: PresenceCursor | null;
  selectedIds: string[];
}

/** Structural subset of y-protocols Awareness used here (keeps tests light). */
export interface PresenceAwareness {
  clientID: number;
  getStates: () => Map<number, unknown>;
  on: (event: 'change', listener: () => void) => void;
  off: (event: 'change', listener: () => void) => void;
}

export const PRESENCE_COLORS = [
  '#7868e6',
  '#0ea5e9',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#ec4899',
];

export const MAX_PRESENCE_NAME_LENGTH = 24;
export const MAX_PRESENCE_ID_LENGTH = 64;
export const MAX_REMOTE_SELECTED_IDS = 100;
export const CURSOR_THROTTLE_MS = 33;
export const CURSOR_MIN_DELTA_PCT = 0.25;

const GUEST_ID_KEY = 'fabriik-guest-id';
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g;

export function colorForId(id: string): string {
  if (!id) return PRESENCE_COLORS[0];
  let hash = 5381;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, '').trim();
}

function newGuestId(): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return raw.slice(0, 16);
}

/** Stable per-session identity: id + name + deterministic color. */
export function resolveIdentity(): PresenceUser {
  const name =
    cleanText(resolveIdentityName()).slice(0, MAX_PRESENCE_NAME_LENGTH) || 'Guest';
  if (typeof sessionStorage === 'undefined') {
    return { id: 'guest', name, color: colorForId('guest') };
  }
  let id = sessionStorage.getItem(GUEST_ID_KEY) ?? '';
  if (!id) {
    id = newGuestId();
    sessionStorage.setItem(GUEST_ID_KEY, id);
  }
  const safeId =
    cleanText(id).slice(0, MAX_PRESENCE_ID_LENGTH) || 'guest';
  return { id: safeId, name, color: colorForId(safeId) };
}

export function sanitizePresenceUser(value: unknown): PresenceUser | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const rawName = typeof record.name === 'string' ? cleanText(record.name) : '';
  if (!rawName) return null;
  const name = rawName.slice(0, MAX_PRESENCE_NAME_LENGTH);
  const id =
    (typeof record.id === 'string' ? cleanText(record.id) : '').slice(
      0,
      MAX_PRESENCE_ID_LENGTH,
    ) || 'unknown';
  const rawColor =
    typeof record.color === 'string' ? record.color.trim().toLowerCase() : '';
  const color = HEX_COLOR_PATTERN.test(rawColor) ? rawColor : colorForId(id);
  return { id, name, color };
}

function clampPct(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

export function sanitizeCursor(value: unknown): PresenceCursor | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const { xPct, yPct } = record;
  if (typeof xPct !== 'number' || typeof yPct !== 'number') return null;
  if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return null;
  return { xPct: clampPct(xPct), yPct: clampPct(yPct) };
}

export function sanitizeSelectedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
    if (ids.length >= MAX_REMOTE_SELECTED_IDS) break;
  }
  return ids;
}

/** Awareness states of remote clients, sanitized and sorted for stable render. */
export function collectRemotePresence(
  awareness: PresenceAwareness,
  selfId: string,
): RemotePresence[] {
  const remote: RemotePresence[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    if (!state || typeof state !== 'object') continue;
    const record = state as Record<string, unknown>;
    const user = sanitizePresenceUser(record.user);
    if (!user || (selfId && user.id === selfId)) continue;
    remote.push({
      clientId,
      user,
      cursor: sanitizeCursor(record.cursor),
      selectedIds: sanitizeSelectedIds(record.selectedIds),
    });
  }
  remote.sort((a, b) => a.clientId - b.clientId);
  return remote;
}

interface PresenceSnapshot {
  source: PresenceAwareness | null;
  selfId: string;
  value: RemotePresence[];
}

/** Subscribes to awareness content changes (never clock-only renewals). */
export function useRemotePresence(
  awareness: PresenceAwareness | null,
  selfId = '',
): RemotePresence[] {
  const cache = useRef<PresenceSnapshot | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      cache.current = null;
      if (!awareness) return () => {};
      const listener = (): void => {
        cache.current = null;
        onStoreChange();
      };
      awareness.on('change', listener);
      return () => awareness.off('change', listener);
    },
    [awareness],
  );
  const getSnapshot = useCallback(() => {
    if (
      !cache.current ||
      cache.current.source !== awareness ||
      cache.current.selfId !== selfId
    ) {
      cache.current = {
        source: awareness,
        selfId,
        value: awareness ? collectRemotePresence(awareness, selfId) : [],
      };
    }
    return cache.current.value;
  }, [awareness, selfId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface CursorBroadcaster {
  send: (cursor: PresenceCursor) => void;
  flush: () => void;
  cancel: () => void;
}

export interface CursorBroadcasterOptions {
  intervalMs?: number;
  minDeltaPct?: number;
  now?: () => number;
}

/**
 * Trailing-edge throttle for cursor sends: leading emit when idle, at most one
 * emit per interval, quantized below the movement threshold to keep the O(N)
 * awareness fan-out cheap (DLD §9, yjs#732).
 */
export function createCursorBroadcaster(
  emit: (cursor: PresenceCursor) => void,
  options: CursorBroadcasterOptions = {},
): CursorBroadcaster {
  const intervalMs = options.intervalMs ?? CURSOR_THROTTLE_MS;
  const minDeltaPct = options.minDeltaPct ?? CURSOR_MIN_DELTA_PCT;
  const now = options.now ?? Date.now;
  let lastSent: PresenceCursor | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: PresenceCursor | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const farEnough = (cursor: PresenceCursor): boolean =>
    lastSent === null ||
    Math.abs(cursor.xPct - lastSent.xPct) >= minDeltaPct ||
    Math.abs(cursor.yPct - lastSent.yPct) >= minDeltaPct;

  const dispatch = (): void => {
    timer = null;
    const cursor = pending;
    pending = null;
    if (!cursor || !farEnough(cursor)) return;
    lastSent = cursor;
    lastSentAt = now();
    emit(cursor);
  };

  const send = (cursor: PresenceCursor): void => {
    const clean = sanitizeCursor(cursor);
    if (!clean) return;
    pending = clean;
    if (timer !== null) return;
    const elapsed = now() - lastSentAt;
    if (elapsed >= intervalMs) dispatch();
    else timer = setTimeout(dispatch, intervalMs - elapsed);
  };

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    dispatch();
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  return { send, flush, cancel };
}
