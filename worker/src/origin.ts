function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);
}

export function isOriginAllowed(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return true;
  return allowed.includes(normalizeOrigin(origin));
}
