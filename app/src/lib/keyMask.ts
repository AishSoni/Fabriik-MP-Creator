export function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length < 8) return '•'.repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
