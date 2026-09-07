import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProviderId } from '../engine/ai/providers/types';
import {
  deleteVaultEnvelope,
  loadSessionKeys,
  loadVaultEnvelope,
  writeSessionKeys,
  writeVaultEnvelope,
} from '../lib/keyStorage';
import {
  encryptVault,
  encryptVaultWithKey,
  decryptVault,
} from '../lib/vaultCrypto';
import type { VaultKdf, VaultPayload } from '../lib/vaultCrypto';

export const AI_SETTINGS_STORAGE_KEY = 'fabriik-ai-settings-v1';

export type AiMode = 'demo' | 'byok';
export type VaultState = 'none' | 'locked' | 'unlocked';

export interface AiSettingsDeps {
  session?: Storage;
  local?: Storage;
  cryptoObj?: Crypto;
}

interface AiSettingsState {
  mode: AiMode;
  providerId: ProviderId | null;
  modelId: string | null;
  keys: Partial<Record<ProviderId, string>>;
  vaultState: VaultState;
  vaultKey: CryptoKey | null;
  vaultKdf: VaultKdf | null;
  vaultProviders: ProviderId[];
  vaultError: string | null;
  vaultNotice: string | null;
  setMode(mode: AiMode): void;
  setProvider(providerId: ProviderId | null, defaultModel?: string | null): void;
  setModel(modelId: string | null): void;
  hydrate(): void;
  setKey(providerId: ProviderId, key: string): void;
  forgetKey(providerId: ProviderId): Promise<void>;
  createVault(providerId: ProviderId, passphrase: string): Promise<void>;
  unlockVault(passphrase: string): Promise<void>;
  rememberKey(providerId: ProviderId): Promise<'saved' | 'needs-unlock' | 'no-key'>;
  forgetVault(): void;
  clearVaultError(): void;
  clearVaultNotice(): void;
}

export function createAiSettingsStore(deps: AiSettingsDeps = {}) {
  const session = deps.session ?? sessionStorage;
  const local = deps.local ?? localStorage;
  const cryptoObj = deps.cryptoObj ?? globalThis.crypto;

  const buildPayload = (keys: Partial<Record<ProviderId, string>>): VaultPayload => ({
    version: 1,
    keys: keys as Record<string, string>,
    updatedAt: new Date().toISOString(),
  });

  return create<AiSettingsState>()(
    persist(
      (set, get) => ({
        mode: 'demo',
        providerId: null,
        modelId: null,
        keys: {},
        vaultState: 'none',
        vaultKey: null,
        vaultKdf: null,
        vaultProviders: [],
        vaultError: null,
        vaultNotice: null,

        setMode: (mode) => set({ mode }),

        setProvider: (providerId, defaultModel = null) => set({ providerId, modelId: defaultModel }),

        setModel: (modelId) => set({ modelId }),

        hydrate: () => {
          const keys = loadSessionKeys(session);
          const envelope = loadVaultEnvelope(local);
          set({
            keys,
            vaultState: envelope ? 'locked' : 'none',
            vaultKey: null,
            vaultKdf: null,
            vaultProviders: [],
          });
        },

        setKey: (providerId, key) => {
          const keys = { ...get().keys, [providerId]: key };
          writeSessionKeys(keys, session);
          set({ keys });
        },

        forgetKey: async (providerId) => {
          const state = get();
          const keys = { ...state.keys };
          delete keys[providerId];
          writeSessionKeys(keys, session);

          if (state.vaultState === 'unlocked' && state.vaultKey && state.vaultKdf) {
            const payloadKeys: Record<string, string> = {};
            for (const id of state.vaultProviders) {
              const value = keys[id];
              if (id !== providerId && value) payloadKeys[id] = value;
            }
            const remaining = Object.keys(payloadKeys) as ProviderId[];
            if (remaining.length === 0) {
              deleteVaultEnvelope(local);
              set({ keys, vaultState: 'none', vaultKey: null, vaultKdf: null, vaultProviders: [] });
              return;
            }
            const envelope = await encryptVaultWithKey(buildPayload(payloadKeys), state.vaultKey, state.vaultKdf, cryptoObj);
            writeVaultEnvelope(envelope, local);
            set({ keys, vaultProviders: remaining });
            return;
          }

          if (state.vaultState === 'locked' && loadVaultEnvelope(local)) {
            set({
              keys,
              vaultNotice:
                'Vault is locked — an encrypted saved copy of this key may remain. Unlock the vault and forget again, or use "Forget saved keys".',
            });
            return;
          }

          set({ keys });
        },

        createVault: async (providerId, passphrase) => {
          const keys = get().keys;
          if (!keys[providerId]) {
            set({ vaultError: 'No key set for this provider — enter a key first.' });
            return;
          }
          const { envelope, key } = await encryptVault(buildPayload(keys), passphrase, cryptoObj);
          writeVaultEnvelope(envelope, local);
          set({
            vaultState: 'unlocked',
            vaultKey: key,
            vaultKdf: envelope.kdf,
            vaultProviders: Object.keys(keys) as ProviderId[],
            vaultError: null,
            vaultNotice: null,
          });
        },

        unlockVault: async (passphrase) => {
          const envelope = loadVaultEnvelope(local);
          if (!envelope) {
            set({ vaultError: 'No saved vault found.' });
            return;
          }
          try {
            const { payload, key } = await decryptVault(envelope, passphrase, cryptoObj);
            const vaultKeys = payload.keys as Partial<Record<ProviderId, string>>;
            set({
              keys: { ...vaultKeys, ...get().keys },
              vaultState: 'unlocked',
              vaultKey: key,
              vaultKdf: envelope.kdf,
              vaultProviders: Object.keys(payload.keys) as ProviderId[],
              vaultError: null,
              vaultNotice: null,
            });
          } catch {
            set({ vaultError: 'Incorrect passphrase. The vault was not changed.' });
          }
        },

        rememberKey: async (providerId) => {
          const state = get();
          if (!state.keys[providerId]) return 'no-key';
          if (state.vaultState !== 'unlocked' || !state.vaultKey || !state.vaultKdf) return 'needs-unlock';
          const envelope = await encryptVaultWithKey(buildPayload(state.keys), state.vaultKey, state.vaultKdf, cryptoObj);
          writeVaultEnvelope(envelope, local);
          set({
            vaultProviders: Object.keys(state.keys) as ProviderId[],
            vaultNotice: null,
          });
          return 'saved';
        },

        forgetVault: () => {
          deleteVaultEnvelope(local);
          set({
            vaultState: 'none',
            vaultKey: null,
            vaultKdf: null,
            vaultProviders: [],
            vaultError: null,
            vaultNotice: null,
          });
        },

        clearVaultError: () => set({ vaultError: null }),
        clearVaultNotice: () => set({ vaultNotice: null }),
      }),
      {
        name: AI_SETTINGS_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => local),
        partialize: (state) => ({
          mode: state.mode,
          providerId: state.providerId,
          modelId: state.modelId,
        }),
      },
    ),
  );
}

export const useAiSettingsStore = createAiSettingsStore();
