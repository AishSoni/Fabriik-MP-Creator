import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_KEYS_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  deleteVaultEnvelope,
  loadSessionKeys,
  loadVaultEnvelope,
  writeSessionKeys,
  writeVaultEnvelope,
} from './keyStorage';
import type { VaultEnvelope } from './vaultCrypto';

const envelope: VaultEnvelope = {
  format: 'fabriik-byok-vault',
  version: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: 'AAAA' },
  cipher: { name: 'AES-GCM', iv: 'BBBB', data: 'CCCC' },
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('keyStorage session mirror (spec ai-byok §5.1–5.2)', () => {
  it('writes and reads the session key map', () => {
    writeSessionKeys({ gemini: 'AIza-1', openai: 'sk-1' });

    const raw = sessionStorage.getItem(SESSION_KEYS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ version: 1, keys: { gemini: 'AIza-1', openai: 'sk-1' } });

    expect(loadSessionKeys()).toEqual({ gemini: 'AIza-1', openai: 'sk-1' });
  });

  it('returns an empty map when nothing is stored', () => {
    expect(loadSessionKeys()).toEqual({});
  });

  it('removes the mirror entirely when the last key is forgotten', () => {
    writeSessionKeys({ gemini: 'AIza-1' });
    writeSessionKeys({});

    expect(sessionStorage.getItem(SESSION_KEYS_STORAGE_KEY)).toBeNull();
    expect(loadSessionKeys()).toEqual({});
  });

  it('treats corrupt JSON as absent', () => {
    sessionStorage.setItem(SESSION_KEYS_STORAGE_KEY, '{not json');
    expect(loadSessionKeys()).toEqual({});
  });

  it('treats a wrong-shape mirror as absent', () => {
    sessionStorage.setItem(SESSION_KEYS_STORAGE_KEY, '["array"]');
    expect(loadSessionKeys()).toEqual({});

    sessionStorage.setItem(SESSION_KEYS_STORAGE_KEY, JSON.stringify({ version: 1, keys: 'nope' }));
    expect(loadSessionKeys()).toEqual({});
  });
});

describe('keyStorage vault IO (spec ai-byok §5.1, §5.3)', () => {
  it('writes and reads the vault envelope', () => {
    writeVaultEnvelope(envelope);

    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBe(JSON.stringify(envelope));
    expect(loadVaultEnvelope()).toEqual(envelope);
  });

  it('returns null when no vault is stored', () => {
    expect(loadVaultEnvelope()).toBeNull();
  });

  it('returns null for corrupt vault JSON', () => {
    localStorage.setItem(VAULT_STORAGE_KEY, '{broken');
    expect(loadVaultEnvelope()).toBeNull();
  });

  it('returns null for a non-envelope payload', () => {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(loadVaultEnvelope()).toBeNull();
  });

  it('deletes the vault envelope', () => {
    writeVaultEnvelope(envelope);
    deleteVaultEnvelope();

    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
    expect(() => deleteVaultEnvelope()).not.toThrow();
  });
});
