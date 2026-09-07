import { useState } from 'react';
import { createLlmProvider, DEFAULT_PROVIDER_ID, listProviders } from '../../engine/ai/providers';
import { ProviderError } from '../../engine/ai/providers/types';
import type { ProviderId } from '../../engine/ai/providers/types';
import { maskKey } from '../../lib/keyMask';
import { useAiSettingsStore } from '../../store/aiSettingsStore';
import { ModelPicker } from './ModelPicker';

type VaultUi = 'idle' | 'create' | 'unlock-remember' | 'unlock-startup';

export function AiSettingsSection({ darkMode }: { darkMode: boolean }) {
  const mode = useAiSettingsStore((s) => s.mode);
  const providerId = useAiSettingsStore((s) => s.providerId);
  const modelId = useAiSettingsStore((s) => s.modelId);
  const keys = useAiSettingsStore((s) => s.keys);
  const vaultState = useAiSettingsStore((s) => s.vaultState);
  const vaultError = useAiSettingsStore((s) => s.vaultError);
  const vaultNotice = useAiSettingsStore((s) => s.vaultNotice);

  const [draft, setDraft] = useState('');
  const [remember, setRemember] = useState(false);
  const [rememberHint, setRememberHint] = useState<string | null>(null);
  const [vaultUi, setVaultUi] = useState<VaultUi>('idle');
  const [startupDismissed, setStartupDismissed] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const providers = listProviders();
  const effective = (providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;
  const provider = providers.find((p) => p.id === effective) ?? providers[0];
  const savedKey = keys[effective] ?? null;
  const sessionEmpty = Object.keys(keys).length === 0;
  const startupPrompt = vaultUi === 'idle' && !startupDismissed && vaultState === 'locked' && sessionEmpty;

  const store = () => useAiSettingsStore.getState();

  const chooseRemember = async () => {
    setRememberHint(null);
    if (!savedKey) {
      setRememberHint('Enter a key first, then remember it.');
      setRemember(false);
      return;
    }
    if (vaultState === 'unlocked') {
      await store().rememberKey(effective);
      return;
    }
    setVaultUi(vaultState === 'none' ? 'create' : 'unlock-remember');
  };

  const saveKey = async () => {
    const value = draft.trim();
    if (!value) return;
    store().setKey(effective, value);
    setDraft('');
    setRememberHint(null);
    if (remember) {
      if (vaultState === 'unlocked') await store().rememberKey(effective);
      else if (vaultState === 'none') setVaultUi('create');
      else setVaultUi('unlock-remember');
    }
  };

  const handleCreate = async () => {
    await store().createVault(effective, passphrase);
    setPassphrase('');
    setConfirmPassphrase('');
    setVaultUi('idle');
  };

  const handleUnlock = async (intent: 'remember' | 'startup') => {
    await store().unlockVault(unlockPass);
    const state = store();
    if (state.vaultState === 'unlocked') {
      state.clearVaultError();
      if (intent === 'remember') await state.rememberKey(effective);
      setUnlockPass('');
      setVaultUi('idle');
    }
  };

  const testConnection = async () => {
    setTestStatus(null);
    try {
      const target = createLlmProvider(effective);
      await target.complete({
        model: modelId ?? target.defaultModel,
        apiKey: savedKey,
        system: 'You are a connection test. Reply with OK.',
        user: 'Reply with OK.',
        schema: { type: 'object' },
      });
      setTestStatus('Connection OK.');
    } catch (error) {
      setTestStatus(error instanceof ProviderError ? `Connection failed: ${error.message}` : 'Connection failed.');
    }
  };

  const createValid = passphrase.length >= 8 && passphrase === confirmPassphrase;

  const toggleClass = (active: boolean) =>
    `cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
      active
        ? 'bg-accent text-white shadow-sm'
        : darkMode
          ? 'border border-white/10 bg-surface-dark text-muted-dark hover:text-stone'
          : 'border border-stone bg-paper text-muted-strong hover:text-ink'
    }`;

  const inputClass = `w-full rounded-2xl border px-3.5 py-2.5 text-[13px] leading-5 transition-colors duration-200 placeholder:text-muted-dark focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${
    darkMode ? 'border-white/10 bg-surface-dark text-paper focus:border-accent' : 'border-stone bg-surface text-ink focus:border-accent'
  }`;

  return (
    <section
      aria-label="AI settings"
      className={`rounded-[20px] border p-3.5 ${darkMode ? 'border-white/10 bg-surface-dark-raised' : 'border-stone bg-surface shadow-[0_1px_2px_rgba(22,22,24,0.06),0_12px_32px_rgba(22,22,24,0.06)]'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="AI mode" className="flex gap-1.5">
          <button type="button" aria-pressed={mode === 'demo'} className={toggleClass(mode === 'demo')} onClick={() => store().setMode('demo')}>
            Demo
          </button>
          <button type="button" aria-pressed={mode === 'byok'} className={toggleClass(mode === 'byok')} onClick={() => store().setMode('byok')}>
            BYOK
          </button>
        </div>
        <span className={`text-[11px] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>
          {mode === 'demo' ? 'Free deterministic demo' : 'Your key, your provider'}
        </span>
      </div>

      {mode === 'byok' && (
        <div className="mt-3 flex flex-col gap-3">
          {startupPrompt && (
            <div className={`rounded-2xl border p-3 ${darkMode ? 'border-white/10 bg-surface-dark' : 'border-stone bg-paper'}`}>
              <p className={`text-xs font-bold uppercase tracking-[0.08em] ${darkMode ? 'text-stone' : 'text-ink'}`}>Unlock saved keys</p>
              <p className={`mt-1 text-[11px] leading-5 ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>
                An encrypted vault from a previous session is available. Dismiss to stay session-only.
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <input
                  aria-label="Vault passphrase"
                  type="password"
                  autoComplete="off"
                  value={unlockPass}
                  onChange={(e) => setUnlockPass(e.target.value)}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={unlockPass.length === 0}
                    onClick={() => void handleUnlock('startup')}
                    className={`cursor-pointer rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'disabled:bg-surface/10' : 'disabled:bg-stone'}`}
                  >
                    Unlock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartupDismissed(true);
                      setVaultUi('idle');
                    }}
                    className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${darkMode ? 'border-white/10 bg-surface/5 text-stone hover:bg-surface/10' : 'border-stone bg-surface text-muted-strong hover:bg-paper'}`}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>Provider</span>
              <select
                aria-label="AI provider"
                value={effective}
                onChange={(e) => {
                  const next = providers.find((p) => p.id === e.target.value);
                  if (!next) return;
                  store().setProvider(next.id, next.defaultModel);
                  setDraft('');
                }}
                className={inputClass}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>Model</span>
              <ModelPicker
                providerId={effective}
                fallbackModels={provider.models}
                currentModel={modelId ?? provider.defaultModel}
                apiKey={provider.requiresKey ? savedKey : null}
                onSelect={(model) => store().setModel(model)}
                darkMode={darkMode}
              />
            </div>
          </div>

          {provider.requiresKey && (
            <label className="flex flex-col gap-1">
              <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>API key</span>
              <input
                aria-label="API key"
                type="password"
                autoComplete="off"
                value={draft}
                placeholder={savedKey ? `Saved ${maskKey(savedKey)}` : 'Paste your API key'}
                onChange={(e) => setDraft(e.target.value)}
                className={inputClass}
              />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {provider.requiresKey && (
              <button
                type="button"
                disabled={draft.trim().length === 0}
                onClick={() => void saveKey()}
                className={`cursor-pointer rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'bg-stone hover:bg-stone' : ''}`}
              >
                Save key
              </button>
            )}
            {provider.requiresKey && savedKey && (
              <button
                type="button"
                onClick={() => void store().forgetKey(effective)}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${darkMode ? 'border-white/10 bg-surface/5 text-stone hover:bg-surface/10' : 'border-stone bg-surface text-muted-strong hover:bg-paper'}`}
              >
                Forget key
              </button>
            )}
            <button
              type="button"
              disabled={provider.requiresKey && !savedKey}
              onClick={() => void testConnection()}
              className={`cursor-pointer rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Test connection
            </button>
          </div>

          {provider.requiresKey ? (
            <>
              <label className={`flex items-center gap-2 text-xs ${darkMode ? 'text-stone' : 'text-ink'}`}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    if (e.target.checked) void chooseRemember();
                    else setRememberHint(null);
                  }}
                  className="h-4 w-4 cursor-pointer accent-[#7868E6]"
                />
                Remember this key
              </label>
              {rememberHint && <p className={`text-[11px] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>{rememberHint}</p>}
            </>
          ) : (
            <p className={`text-[11px] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>
              No API key needed. This provider runs locally on your machine.
            </p>
          )}

          {vaultUi === 'create' && (
            <div className={`rounded-2xl border p-3 ${darkMode ? 'border-white/10 bg-surface-dark' : 'border-stone bg-paper'}`}>
              <p className={`text-xs font-bold uppercase tracking-[0.08em] ${darkMode ? 'text-stone' : 'text-ink'}`}>Create a vault passphrase</p>
              <p className={`mt-1 text-[11px] leading-5 ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>
                Use at least 8 characters. The passphrase never leaves this browser and cannot be recovered.
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <input
                  aria-label="Vault passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className={inputClass}
                />
                <input
                  aria-label="Confirm passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={!createValid}
                  onClick={() => void handleCreate()}
                  className={`cursor-pointer self-start rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'disabled:bg-surface/10' : 'disabled:bg-stone'}`}
                >
                  Create vault
                </button>
              </div>
            </div>
          )}

          {vaultUi === 'unlock-remember' && (
            <div className={`rounded-2xl border p-3 ${darkMode ? 'border-white/10 bg-surface-dark' : 'border-stone bg-paper'}`}>
              <p className={`text-xs font-bold uppercase tracking-[0.08em] ${darkMode ? 'text-stone' : 'text-ink'}`}>Unlock saved keys</p>
              <p className={`mt-1 text-[11px] leading-5 ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>Enter the vault passphrase to remember this key.</p>
              <div className="mt-2 flex flex-col gap-2">
                <input
                  aria-label="Vault passphrase"
                  type="password"
                  autoComplete="off"
                  value={unlockPass}
                  onChange={(e) => setUnlockPass(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={unlockPass.length === 0}
                  onClick={() => void handleUnlock('remember')}
                  className={`cursor-pointer self-start rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'disabled:bg-surface/10' : 'disabled:bg-stone'}`}
                >
                  Unlock
                </button>
              </div>
            </div>
          )}

          {vaultError && (
            <p role="alert" className="rounded-2xl border border-[#E85D4A]/20 bg-[#FFEDEA] px-3 py-2 text-[11px] font-medium text-[#B42318]">
              {vaultError}
            </p>
          )}
          {vaultNotice && (
            <p role="status" className="rounded-2xl border border-[#1DB188]/20 bg-[#E9F9F1] px-3 py-2 text-[11px] font-medium text-[#0E7A5B]">
              {vaultNotice}
            </p>
          )}

          {vaultState !== 'none' && (
            <button
              type="button"
              onClick={() => {
                store().forgetVault();
                setVaultUi('idle');
              }}
              className={`cursor-pointer self-start rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${darkMode ? 'border-[#E85D4A]/30 bg-surface/5 text-[#FF9B8F] hover:bg-surface/10' : 'border-[#E85D4A]/30 bg-[#FFEDEA] text-[#B42318] hover:bg-[#FFE0DB]'}`}
            >
              Forget saved keys
            </button>
          )}

          <p className={`text-[11px] leading-5 ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>
            Your key is stored only in this browser (session-only by default) and sent directly to the provider — never to our servers.
          </p>

          {testStatus && (
            <p role="status" className={`text-[11px] font-medium ${testStatus.startsWith('Connection OK') ? 'text-[#0E7A5B]' : 'text-[#B42318]'}`}>
              {testStatus}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
