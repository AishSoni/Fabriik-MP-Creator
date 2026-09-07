import { describe, expect, it } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  decryptVault,
  encryptVault,
  encryptVaultWithKey,
  isVaultEnvelope,
  type VaultEnvelope,
  type VaultPayload,
} from './vaultCrypto';

const payload = (keys: Record<string, string> = { gemini: 'AIza-test-key' }): VaultPayload => ({
  version: 1,
  keys,
  updatedAt: '2026-09-07T00:00:00.000Z',
});

const byteLength = (b64: string) => atob(b64).length;

const tamperData = (envelope: VaultEnvelope): VaultEnvelope => {
  const data = envelope.cipher.data;
  const mid = Math.floor(data.length / 2);
  const ch = data[mid] === 'A' ? 'B' : 'A';
  return {
    ...envelope,
    cipher: { ...envelope.cipher, data: data.slice(0, mid) + ch + data.slice(mid + 1) },
  };
};

describe('vaultCrypto (spec ai-byok §5.3–5.4)', () => {
  it('round-trips encrypt → decrypt', async () => {
    const { envelope, key } = await encryptVault(payload(), 'correct horse battery');

    expect(isVaultEnvelope(envelope)).toBe(true);
    const { payload: out } = await decryptVault(envelope, 'correct horse battery');
    expect(out).toEqual(payload());

    expect(key.extractable).toBe(false);
    expect([...key.usages]).toEqual(['encrypt', 'decrypt']);
  });

  it('round-trips unicode passphrases', async () => {
    const { envelope } = await encryptVault(payload(), 'päss-wörd🔑');
    const { payload: out } = await decryptVault(envelope, 'päss-wörd🔑');
    expect(out).toEqual(payload());
  });

  it('writes the spec envelope shape', async () => {
    const { envelope } = await encryptVault(payload(), 'passphrase');

    expect(envelope.format).toBe('fabriik-byok-vault');
    expect(envelope.version).toBe(1);
    expect(envelope.kdf.name).toBe('PBKDF2');
    expect(envelope.kdf.hash).toBe('SHA-256');
    expect(envelope.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(PBKDF2_ITERATIONS).toBe(600000);
    expect(byteLength(envelope.kdf.salt)).toBe(16);
    expect(envelope.cipher.name).toBe('AES-GCM');
    expect(byteLength(envelope.cipher.iv)).toBe(12);
  });

  it('rejects a wrong passphrase (GCM authentication failure)', async () => {
    const { envelope } = await encryptVault(payload(), 'right');
    await expect(decryptVault(envelope, 'wrong')).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const { envelope } = await encryptVault(payload(), 'passphrase');
    await expect(decryptVault(tamperData(envelope), 'passphrase')).rejects.toThrow();
  });

  it('rejects an invalid envelope', async () => {
    await expect(
      decryptVault({ format: 'other' } as unknown as VaultEnvelope, 'passphrase'),
    ).rejects.toThrow();
  });

  it('rotates salt and IV across passphrase-based writes', async () => {
    const first = await encryptVault(payload(), 'passphrase');
    const second = await encryptVault(payload(), 'passphrase');

    expect(second.envelope.kdf.salt).not.toBe(first.envelope.kdf.salt);
    expect(second.envelope.cipher.iv).not.toBe(first.envelope.cipher.iv);
    expect(second.envelope.cipher.data).not.toBe(first.envelope.cipher.data);
  });

  it('rotates the IV (not the salt) on cached-key re-encryption', async () => {
    const { envelope, key } = await encryptVault(payload(), 'passphrase');
    const rewritten = await encryptVaultWithKey(payload({ openai: 'sk-2' }), key, envelope.kdf);

    expect(rewritten.kdf.salt).toBe(envelope.kdf.salt);
    expect(rewritten.cipher.iv).not.toBe(envelope.cipher.iv);

    const { payload: out } = await decryptVault(rewritten, 'passphrase');
    expect(out.keys).toEqual({ openai: 'sk-2' });
  });

  it('flags non-envelope values via isVaultEnvelope', () => {
    expect(isVaultEnvelope(null)).toBe(false);
    expect(isVaultEnvelope('json')).toBe(false);
    expect(isVaultEnvelope({})).toBe(false);
    expect(isVaultEnvelope({ format: 'fabriik-byok-vault', version: 2 })).toBe(false);
    expect(isVaultEnvelope({ format: 'fabriik-byok-vault', version: 1 })).toBe(false);
  });
});
