import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_KEYS_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  writeVaultEnvelope,
} from '../lib/keyStorage';
import { decryptVault, isVaultEnvelope } from '../lib/vaultCrypto';
import type { VaultEnvelope } from '../lib/vaultCrypto';
import { AI_SETTINGS_STORAGE_KEY, createAiSettingsStore } from './aiSettingsStore';

const PASSPHRASE = 'correct-horse-battery-staple';

const staticEnvelope: VaultEnvelope = {
  format: 'fabriik-byok-vault',
  version: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: 'AAAA' },
  cipher: { name: 'AES-GCM', iv: 'BBBB', data: 'CCCC' },
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('aiSettingsStore hydration (spec ai-byok §5.2, §5.5 startup)', () => {
  it('hydrates the session mirror and reports a locked vault when an envelope exists', () => {
    sessionStorage.setItem(
      SESSION_KEYS_STORAGE_KEY,
      JSON.stringify({ version: 1, keys: { gemini: 'sk-session' } }),
    );
    writeVaultEnvelope(staticEnvelope);

    const useStore = createAiSettingsStore();
    useStore.getState().hydrate();

    const state = useStore.getState();
    expect(state.keys).toEqual({ gemini: 'sk-session' });
    expect(state.vaultState).toBe('locked');
    expect(state.vaultKey).toBeNull();
  });

  it('reports vaultState none when no envelope exists', () => {
    sessionStorage.setItem(
      SESSION_KEYS_STORAGE_KEY,
      JSON.stringify({ version: 1, keys: { gemini: 'sk-session' } }),
    );

    const useStore = createAiSettingsStore();
    useStore.getState().hydrate();

    expect(useStore.getState().vaultState).toBe('none');
  });

  it('starts with empty keys and a locked vault when only an envelope exists', () => {
    writeVaultEnvelope(staticEnvelope);

    const useStore = createAiSettingsStore();
    useStore.getState().hydrate();

    const state = useStore.getState();
    expect(state.keys).toEqual({});
    expect(state.vaultState).toBe('locked');
  });
});

describe('aiSettingsStore key management (§5.5)', () => {
  it('setKey stores the key in memory and mirrors the full map to sessionStorage', () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'AIza-1');
    useStore.getState().setKey('openai', 'sk-1');

    expect(useStore.getState().keys).toEqual({ gemini: 'AIza-1', openai: 'sk-1' });
    const raw = sessionStorage.getItem(SESSION_KEYS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ version: 1, keys: { gemini: 'AIza-1', openai: 'sk-1' } });
  });

  it('forgetKey removes the key from memory and the session mirror', () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'AIza-1');
    useStore.getState().setKey('openai', 'sk-1');

    useStore.getState().forgetKey('gemini');

    expect(useStore.getState().keys).toEqual({ openai: 'sk-1' });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEYS_STORAGE_KEY) as string)).toEqual({
      version: 1,
      keys: { openai: 'sk-1' },
    });
  });

  it('forgetKey without a vault is silent about the vault', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'AIza-1');

    await useStore.getState().forgetKey('gemini');

    expect(useStore.getState().vaultNotice).toBeNull();
    expect(useStore.getState().vaultState).toBe('none');
  });

  it('forgetKey with a locked vault skips vault re-encryption and says so', async () => {
    writeVaultEnvelope(staticEnvelope);
    const useStore = createAiSettingsStore();
    useStore.getState().hydrate();
    useStore.getState().setKey('gemini', 'sk-session');
    const envelopeBefore = localStorage.getItem(VAULT_STORAGE_KEY);

    await useStore.getState().forgetKey('gemini');

    const state = useStore.getState();
    expect(state.keys).toEqual({});
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBe(envelopeBefore);
    expect(state.vaultNotice).toContain('locked');
  });
});

describe('aiSettingsStore vault flows (§5.3-§5.5)', () => {
  it('createVault encrypts the full key map and caches a non-extractable CryptoKey', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-g');
    useStore.getState().setKey('openai', 'sk-o');

    await useStore.getState().createVault('gemini', PASSPHRASE);

    const state = useStore.getState();
    expect(state.vaultState).toBe('unlocked');
    expect(state.vaultKey).not.toBeNull();
    expect(state.vaultError).toBeNull();
    expect(state.vaultProviders).toEqual(['gemini', 'openai']);

    const envelope = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) as string);
    expect(isVaultEnvelope(envelope)).toBe(true);
    const { payload } = await decryptVault(envelope, PASSPHRASE);
    expect(payload.keys).toEqual({ gemini: 'sk-g', openai: 'sk-o' });
  });

  it('createVault without a key for the provider explains the problem', async () => {
    const useStore = createAiSettingsStore();

    await useStore.getState().createVault('gemini', PASSPHRASE);

    expect(useStore.getState().vaultError).toContain('No key');
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
  });

  it('unlockVault rejects a wrong passphrase, then unlocks with the right one', async () => {
    const first = createAiSettingsStore();
    first.getState().setKey('gemini', 'sk-g');
    await first.getState().createVault('gemini', PASSPHRASE);

    const second = createAiSettingsStore();
    second.getState().hydrate();
    expect(second.getState().vaultState).toBe('locked');

    await second.getState().unlockVault('wrong-passphrase');
    expect(second.getState().vaultState).toBe('locked');
    expect(second.getState().vaultError).toBe('Incorrect passphrase. The vault was not changed.');
    expect(second.getState().vaultKey).toBeNull();

    second.getState().clearVaultError();
    expect(second.getState().vaultError).toBeNull();

    await second.getState().unlockVault(PASSPHRASE);
    const state = second.getState();
    expect(state.vaultState).toBe('unlocked');
    expect(state.vaultError).toBeNull();
    expect(state.keys.gemini).toBe('sk-g');
    expect(state.vaultKey).toBeInstanceOf(CryptoKey);
    expect(state.vaultProviders).toEqual(['gemini']);
  });

  it('unlockVault without an envelope explains that no saved vault exists', async () => {
    const useStore = createAiSettingsStore();
    await useStore.getState().unlockVault(PASSPHRASE);
    expect(useStore.getState().vaultError).toContain('No saved vault');
  });

  it('unlocked vault keys merge under session keys when both exist', async () => {
    const first = createAiSettingsStore();
    first.getState().setKey('gemini', 'sk-vault');
    await first.getState().createVault('gemini', PASSPHRASE);

    const second = createAiSettingsStore();
    second.getState().hydrate();
    second.getState().setKey('gemini', 'sk-session');
    await second.getState().unlockVault(PASSPHRASE);

    expect(second.getState().keys.gemini).toBe('sk-session');
  });
});

describe('aiSettingsStore remember/forget flows (§5.5)', () => {
  it('rememberKey on a locked vault asks the UI to unlock first', async () => {
    const first = createAiSettingsStore();
    first.getState().setKey('gemini', 'sk-g');
    await first.getState().createVault('gemini', PASSPHRASE);

    const second = createAiSettingsStore();
    second.getState().hydrate();
    const before = localStorage.getItem(VAULT_STORAGE_KEY);

    await expect(second.getState().rememberKey('gemini')).resolves.toBe('needs-unlock');
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBe(before);
  });

  it('rememberKey without a stored key reports no-key', async () => {
    const useStore = createAiSettingsStore();
    await expect(useStore.getState().rememberKey('gemini')).resolves.toBe('no-key');
  });

  it('rememberKey on an unlocked vault re-encrypts the full key map', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-g');
    await useStore.getState().createVault('gemini', PASSPHRASE);
    useStore.getState().setKey('openai', 'sk-o');

    await expect(useStore.getState().rememberKey('openai')).resolves.toBe('saved');

    const envelope = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) as string);
    const { payload } = await decryptVault(envelope, PASSPHRASE);
    expect(payload.keys).toEqual({ gemini: 'sk-g', openai: 'sk-o' });
    expect(useStore.getState().vaultProviders).toEqual(['gemini', 'openai']);
  });

  it('forgetKey on an unlocked vault re-encrypts the vault without the provider', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-g');
    useStore.getState().setKey('openai', 'sk-o');
    await useStore.getState().createVault('gemini', PASSPHRASE);
    await expect(useStore.getState().rememberKey('openai')).resolves.toBe('saved');

    await useStore.getState().forgetKey('gemini');

    const state = useStore.getState();
    expect(state.keys).toEqual({ openai: 'sk-o' });
    expect(state.vaultProviders).toEqual(['openai']);
    const envelope = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) as string);
    const { payload } = await decryptVault(envelope, PASSPHRASE);
    expect(payload.keys).toEqual({ openai: 'sk-o' });
  });

  it('forgetKey that removes the last vault key deletes the envelope', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-g');
    await useStore.getState().createVault('gemini', PASSPHRASE);

    await useStore.getState().forgetKey('gemini');

    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
    expect(useStore.getState().vaultState).toBe('none');
    expect(useStore.getState().keys).toEqual({});
  });

  it('forgetVault deletes the envelope outright and leaves session keys alone', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-g');
    await useStore.getState().createVault('gemini', PASSPHRASE);

    useStore.getState().forgetVault();

    const state = useStore.getState();
    expect(state.vaultState).toBe('none');
    expect(state.vaultKey).toBeNull();
    expect(state.vaultProviders).toEqual([]);
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
    expect(state.keys.gemini).toBe('sk-g');
    expect(sessionStorage.getItem(SESSION_KEYS_STORAGE_KEY)).not.toBeNull();
  });
});

describe('aiSettingsStore preferences + persistence hygiene (§2 decision 9, §5.1, §5.6)', () => {
  it('persists only mode, providerId, and modelId — never keys', () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setMode('byok');
    useStore.getState().setProvider('gemini', 'gemini-2.5-flash');
    useStore.getState().setKey('gemini', 'sk-SUPER-SECRET-VALUE');

    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('sk-SUPER-SECRET-VALUE');

    const persisted = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(persisted.state.mode).toBe('byok');
    expect(persisted.state.providerId).toBe('gemini');
    expect(persisted.state.modelId).toBe('gemini-2.5-flash');
    expect(persisted.state.keys).toBeUndefined();
    expect(persisted.state.vaultKey).toBeUndefined();
    expect(Object.keys(persisted.state).sort()).toEqual(['mode', 'modelId', 'providerId']);
  });

  it('setProvider keeps every stored key and adopts the given default model', () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-g');

    useStore.getState().setProvider('openai', 'gpt-x');

    const state = useStore.getState();
    expect(state.providerId).toBe('openai');
    expect(state.modelId).toBe('gpt-x');
    expect(state.keys.gemini).toBe('sk-g');
  });

  it('vault secrets never leak into the persisted settings blob', async () => {
    const useStore = createAiSettingsStore();
    useStore.getState().setKey('gemini', 'sk-VAULTED-SECRET');
    await useStore.getState().createVault('gemini', PASSPHRASE);

    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY) as string;
    expect(raw).not.toContain('sk-VAULTED-SECRET');
  });
});
