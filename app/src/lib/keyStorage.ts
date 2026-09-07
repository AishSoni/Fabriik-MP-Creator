import { isVaultEnvelope, type VaultEnvelope } from './vaultCrypto';

export const SESSION_KEYS_STORAGE_KEY = 'fabriik-byok-keys-v1';
export const VAULT_STORAGE_KEY = 'fabriik-byok-vault-v1';

export function loadSessionKeys(storage: Storage = sessionStorage): Record<string, string> {
  try {
    const raw = storage.getItem(SESSION_KEYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const keys = (parsed as { keys?: unknown } | null)?.keys;
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return {};
    const out: Record<string, string> = {};
    for (const [providerId, key] of Object.entries(keys)) {
      if (typeof key === 'string') out[providerId] = key;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSessionKeys(
  keys: Record<string, string>,
  storage: Storage = sessionStorage,
): void {
  if (Object.keys(keys).length === 0) {
    storage.removeItem(SESSION_KEYS_STORAGE_KEY);
    return;
  }
  storage.setItem(SESSION_KEYS_STORAGE_KEY, JSON.stringify({ version: 1, keys }));
}

export function loadVaultEnvelope(storage: Storage = localStorage): VaultEnvelope | null {
  try {
    const raw = storage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isVaultEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeVaultEnvelope(envelope: VaultEnvelope, storage: Storage = localStorage): void {
  storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
}

export function deleteVaultEnvelope(storage: Storage = localStorage): void {
  storage.removeItem(VAULT_STORAGE_KEY);
}
