export function getCollabHost(): string {
  const fromEnv = import.meta.env.VITE_COLLAB_URL;
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : 'ws://localhost:8787';
}

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

export function roomFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const room = new URLSearchParams(window.location.search).get('room');
  return room && ROOM_ID_PATTERN.test(room) ? room : null;
}

export function writeRoomToUrl(room: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  window.history.replaceState(null, '', url);
}

export function clearRoomFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

export function shareUrlFor(room: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  return url.toString();
}

export function newRoomId(): string {
  const raw = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return raw.replace(/-/g, '').slice(0, 10);
}

export function resolveIdentityName(): string {
  if (typeof sessionStorage === 'undefined') return 'Guest';
  const key = 'fabriik-guest-name';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing.slice(0, 24);
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
      : Math.random().toString(36).slice(2, 6).toUpperCase();
  const name = `Guest-${suffix}`;
  sessionStorage.setItem(key, name);
  return name;
}
