export const PBKDF2_ITERATIONS = 600000;

export interface VaultKdf {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
}

export interface VaultCipher {
  name: 'AES-GCM';
  iv: string;
  data: string;
}

export interface VaultEnvelope {
  format: 'fabriik-byok-vault';
  version: 1;
  kdf: VaultKdf;
  cipher: VaultCipher;
}

export interface VaultPayload {
  version: 1;
  keys: Record<string, string>;
  updatedAt: string;
}

export type VaultCryptoDep = Pick<Crypto, 'getRandomValues' | 'subtle'>;

const SALT_BYTES = 16;
const IV_BYTES = 12;

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number, crypto: VaultCryptoDep): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function assertEnvelope(envelope: VaultEnvelope): void {
  if (
    !envelope ||
    envelope.format !== 'fabriik-byok-vault' ||
    envelope.version !== 1 ||
    envelope.kdf?.name !== 'PBKDF2' ||
    envelope.kdf?.hash !== 'SHA-256' ||
    typeof envelope.kdf?.iterations !== 'number' ||
    typeof envelope.kdf?.salt !== 'string' ||
    envelope.cipher?.name !== 'AES-GCM' ||
    typeof envelope.cipher?.iv !== 'string' ||
    typeof envelope.cipher?.data !== 'string'
  ) {
    throw new Error('Invalid vault envelope');
  }
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.format !== 'fabriik-byok-vault' || v.version !== 1) return false;
  const kdf = v.kdf as Record<string, unknown> | undefined;
  const cipher = v.cipher as Record<string, unknown> | undefined;
  return (
    !!kdf &&
    !!cipher &&
    kdf.name === 'PBKDF2' &&
    kdf.hash === 'SHA-256' &&
    typeof kdf.iterations === 'number' &&
    typeof kdf.salt === 'string' &&
    cipher.name === 'AES-GCM' &&
    typeof cipher.iv === 'string' &&
    typeof cipher.data === 'string'
  );
}

export async function deriveKey(
  passphrase: string,
  kdf: VaultKdf,
  crypto: VaultCryptoDep = globalThis.crypto,
): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(kdf.salt), iterations: kdf.iterations },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptVault(
  payload: VaultPayload,
  passphrase: string,
  crypto: VaultCryptoDep = globalThis.crypto,
): Promise<{ envelope: VaultEnvelope; key: CryptoKey }> {
  const kdf: VaultKdf = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToB64(randomBytes(SALT_BYTES, crypto)),
  };
  const key = await deriveKey(passphrase, kdf, crypto);
  const envelope = await encryptVaultWithKey(payload, key, kdf, crypto);
  return { envelope, key };
}

export async function encryptVaultWithKey(
  payload: VaultPayload,
  key: CryptoKey,
  kdf: VaultKdf,
  crypto: VaultCryptoDep = globalThis.crypto,
): Promise<VaultEnvelope> {
  const iv = randomBytes(IV_BYTES, crypto);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    format: 'fabriik-byok-vault',
    version: 1,
    kdf,
    cipher: { name: 'AES-GCM', iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) },
  };
}

export async function decryptVault(
  envelope: VaultEnvelope,
  passphrase: string,
  crypto: VaultCryptoDep = globalThis.crypto,
): Promise<{ payload: VaultPayload; key: CryptoKey }> {
  assertEnvelope(envelope);
  const key = await deriveKey(passphrase, envelope.kdf, crypto);
  const payload = await decryptVaultWithKey(envelope, key, crypto);
  return { payload, key };
}

export async function decryptVaultWithKey(
  envelope: VaultEnvelope,
  key: CryptoKey,
  crypto: VaultCryptoDep = globalThis.crypto,
): Promise<VaultPayload> {
  assertEnvelope(envelope);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(envelope.cipher.iv) },
    key,
    b64ToBytes(envelope.cipher.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as VaultPayload;
}
