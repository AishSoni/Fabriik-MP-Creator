import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiSettingsSection } from './AiSettingsSection';
import { useAiSettingsStore } from '../../store/aiSettingsStore';
import { clearLlmProviderOverrides, listProviders, setLlmProviderOverride } from '../../engine/ai/providers';
import { ProviderError } from '../../engine/ai/providers/types';
import { decryptVault, encryptVault } from '../../lib/vaultCrypto';
import { VAULT_STORAGE_KEY } from '../../lib/keyStorage';

const PASSPHRASE = 'correct horse battery';
const KEY = 'AIzaSyTestKey123456';

function resetAiSettings() {
  useAiSettingsStore.setState({
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
  });
}

async function seedVault(keys: Record<string, string>) {
  const { envelope } = await encryptVault(
    { version: 1, keys, updatedAt: new Date().toISOString() },
    PASSPHRASE,
  );
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
}

async function storedEnvelopePayload() {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  expect(raw).not.toBeNull();
  const envelope = JSON.parse(raw as string);
  const { payload } = await decryptVault(envelope, PASSPHRASE);
  return payload;
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  clearLlmProviderOverrides();
  resetAiSettings();
});

describe('AiSettingsSection', () => {
  it('renders the mode toggle and reveals provider settings only in BYOK mode', async () => {
    const user = userEvent.setup();
    render(<AiSettingsSection darkMode={false} />);

    expect(screen.getByRole('button', { name: 'Demo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('AI provider')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'BYOK' }));
    expect(useAiSettingsStore.getState().mode).toBe('byok');
    expect(screen.getByRole('button', { name: 'BYOK' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('AI provider')).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
  });

  it('model picker queries the provider, supports search, and persists the selection', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    let listCalls = 0;
    setLlmProviderOverride('gemini', {
      id: 'gemini',
      label: 'Google Gemini',
      requiresKey: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash'],
      complete: async () => ({ text: 'OK' }),
      listModels: async () => {
        listCalls += 1;
        return ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
      },
    });
    render(<AiSettingsSection darkMode={false} />);

    const trigger = screen.getByRole('button', { name: 'AI model' });
    expect(trigger).toHaveTextContent('gemini-2.5-flash');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(screen.getByRole('listbox', { name: 'AI model options' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'gemini-2.5-pro' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search models'), 'pro');
    expect(screen.queryByRole('option', { name: 'gemini-2.0-flash' })).toBeNull();
    expect(screen.getByRole('option', { name: 'gemini-2.5-pro' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'gemini-2.5-pro' }));
    expect(useAiSettingsStore.getState().modelId).toBe('gemini-2.5-pro');
    expect(screen.queryByRole('listbox', { name: 'AI model options' })).toBeNull();
    expect(screen.getByRole('button', { name: 'AI model' })).toHaveTextContent('gemini-2.5-pro');

    await user.click(screen.getByRole('button', { name: 'AI model' }));
    expect(await screen.findByRole('option', { name: 'gemini-2.5-flash' })).toBeInTheDocument();
    expect(listCalls).toBe(1);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'AI model options' })).toBeNull();
  });

  it('switching provider resets the model and updates the picker label', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    setLlmProviderOverride('gemini', {
      id: 'gemini',
      label: 'Google Gemini',
      requiresKey: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash'],
      complete: async () => ({ text: 'OK' }),
      listModels: async () => ['gemini-2.5-flash', 'gemini-2.5-pro'],
    });
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'AI model' }));
    await user.click(await screen.findByRole('option', { name: 'gemini-2.5-pro' }));
    expect(useAiSettingsStore.getState().modelId).toBe('gemini-2.5-pro');

    await user.selectOptions(screen.getByLabelText('AI provider'), 'openai');
    expect(useAiSettingsStore.getState().providerId).toBe('openai');
    expect(useAiSettingsStore.getState().modelId).toBe('gpt-4o-mini');
    expect(screen.getByRole('button', { name: 'AI model' })).toHaveTextContent('gpt-4o-mini');
  });

  it('falls back to built-in models when the model list query fails', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    setLlmProviderOverride('gemini', {
      id: 'gemini',
      label: 'Google Gemini',
      requiresKey: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash'],
      complete: async () => ({ text: 'OK' }),
      listModels: async () => {
        throw new ProviderError('network', 'offline');
      },
    });
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'AI model' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not load the model list — showing built-in defaults.',
    );
    for (const model of listProviders().find((p) => p.id === 'gemini')?.models ?? []) {
      expect(screen.getByRole('option', { name: model })).toBeInTheDocument();
    }
  });

  it('shows a loading state while the model list is in flight', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    setLlmProviderOverride('gemini', {
      id: 'gemini',
      label: 'Google Gemini',
      requiresKey: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash'],
      complete: async () => ({ text: 'OK' }),
      listModels: () => new Promise(() => {}),
    });
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'AI model' }));
    expect(await screen.findByText('Loading models…')).toBeInTheDocument();
  });

  it('queries local providers for models without an API key', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    let receivedKey: string | null | undefined = 'sentinel';
    setLlmProviderOverride('ollama', {
      id: 'ollama',
      label: 'Ollama (local)',
      requiresKey: false,
      defaultModel: 'llama3.2',
      models: ['llama3.2'],
      complete: async () => ({ text: 'OK' }),
      listModels: async ({ apiKey }) => {
        receivedKey = apiKey;
        return ['llama3.2:latest'];
      },
    });
    render(<AiSettingsSection darkMode={false} />);

    await user.selectOptions(screen.getByLabelText('AI provider'), 'ollama');
    await user.click(screen.getByRole('button', { name: 'AI model' }));

    expect(await screen.findByRole('option', { name: 'llama3.2:latest' })).toBeInTheDocument();
    expect(receivedKey).toBeNull();
  });

  it('saves a key, masks its display, and never renders the raw key', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    const { container } = render(<AiSettingsSection darkMode={false} />);

    const input = screen.getByLabelText('API key');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');

    await user.type(input, KEY);
    await user.click(screen.getByRole('button', { name: 'Save key' }));

    expect(useAiSettingsStore.getState().keys.gemini).toBe(KEY);
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('API key') as HTMLInputElement).placeholder).toMatch(/AIz…3456/);
    expect(container.textContent).not.toContain(KEY);
    expect(screen.getByRole('button', { name: 'Forget key' })).toBeInTheDocument();
  });

  it('forgets the key from the store', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    useAiSettingsStore.getState().setKey('gemini', KEY);
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'Forget key' }));
    await waitFor(() => expect(useAiSettingsStore.getState().keys.gemini).toBeUndefined());
  });

  it('remember with an unlocked vault re-encrypts the key map without a prompt', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    useAiSettingsStore.getState().setKey('gemini', KEY);
    await useAiSettingsStore.getState().createVault('gemini', PASSPHRASE);
    render(<AiSettingsSection darkMode={false} />);

    expect(screen.queryByText('Create a vault passphrase')).toBeNull();
    await user.click(screen.getByLabelText('Remember this key'));

    await waitFor(async () => {
      const payload = await storedEnvelopePayload();
      expect(payload.keys.gemini).toBe(KEY);
    });
  });

  it('remember with no vault shows the create-passphrase form and creates an encrypted vault', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    const { container } = render(<AiSettingsSection darkMode={false} />);

    await user.type(screen.getByLabelText('API key'), KEY);
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    await user.click(screen.getByLabelText('Remember this key'));

    expect(screen.getByText('Create a vault passphrase')).toBeInTheDocument();
    expect(container.textContent).toContain('at least 8 characters');

    const passInput = screen.getByLabelText('Vault passphrase');
    const confirmInput = screen.getByLabelText('Confirm passphrase');
    await user.type(passInput, PASSPHRASE);
    await user.type(confirmInput, 'wrong-confirm');
    expect(screen.getByRole('button', { name: 'Create vault' })).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Create vault' }));

    await waitFor(() => expect(useAiSettingsStore.getState().vaultState).toBe('unlocked'));
    const payload = await storedEnvelopePayload();
    expect(payload.keys.gemini).toBe(KEY);
    expect(screen.queryByText('Create a vault passphrase')).toBeNull();
  });

  it('remember with a locked vault unlocks first, then saves the key into the vault', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    await seedVault({});
    useAiSettingsStore.getState().setKey('gemini', KEY);
    useAiSettingsStore.setState({ vaultState: 'locked' });
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByLabelText('Remember this key'));
    expect(screen.getByText('Unlock saved keys')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Vault passphrase'), 'wrong-passphrase');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Incorrect passphrase');
    expect(useAiSettingsStore.getState().vaultState).toBe('locked');

    await user.clear(screen.getByLabelText('Vault passphrase'));
    await user.type(screen.getByLabelText('Vault passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(useAiSettingsStore.getState().vaultState).toBe('unlocked'));
    const payload = await storedEnvelopePayload();
    expect(payload.keys.gemini).toBe(KEY);
    expect(screen.queryByText('Unlock saved keys')).toBeNull();
  });

  it('shows a dismissible startup unlock prompt when the session is empty and the vault is locked', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    await seedVault({ gemini: 'saved-key-12345678' });
    useAiSettingsStore.setState({ vaultState: 'locked', keys: {} });
    const { rerender } = render(<AiSettingsSection darkMode={false} />);

    expect(screen.getByText('Unlock saved keys')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Unlock saved keys')).toBeNull();
    expect(useAiSettingsStore.getState().vaultState).toBe('locked');

    rerender(<AiSettingsSection darkMode={false} key="second" />);
    expect(screen.getByText('Unlock saved keys')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Vault passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      const state = useAiSettingsStore.getState();
      expect(state.vaultState).toBe('unlocked');
      expect(state.keys.gemini).toBe('saved-key-12345678');
    });
  });

  it('forgets saved keys destructively while leaving session keys alone', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    await seedVault({ gemini: KEY });
    useAiSettingsStore.getState().setKey('gemini', KEY);
    await useAiSettingsStore.getState().createVault('gemini', PASSPHRASE);
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'Forget saved keys' }));
    expect(useAiSettingsStore.getState().vaultState).toBe('none');
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
    expect(useAiSettingsStore.getState().keys.gemini).toBe(KEY);
  });

  it('tests the connection against the selected provider', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    useAiSettingsStore.getState().setKey('gemini', KEY);
    setLlmProviderOverride('gemini', {
      id: 'gemini',
      label: 'Google Gemini',
      requiresKey: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash'],
      complete: async () => ({ text: 'OK' }),
      listModels: async () => ['gemini-2.5-flash'],
    });
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Connection OK');
  });

  it('reports connection failures from provider errors', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    useAiSettingsStore.getState().setKey('gemini', KEY);
    setLlmProviderOverride('gemini', {
      id: 'gemini',
      label: 'Google Gemini',
      requiresKey: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash'],
      complete: async () => {
        throw new ProviderError('auth', 'API key not valid');
      },
      listModels: async () => ['gemini-2.5-flash'],
    });
    render(<AiSettingsSection darkMode={false} />);

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Connection failed: API key not valid');
  });

  it('local providers hide key entry and stay testable without a key', async () => {
    const user = userEvent.setup();
    useAiSettingsStore.setState({ mode: 'byok' });
    render(<AiSettingsSection darkMode={false} />);

    await user.selectOptions(screen.getByLabelText('AI provider'), 'ollama');
    expect(useAiSettingsStore.getState().providerId).toBe('ollama');
    expect(useAiSettingsStore.getState().modelId).toBe('llama3.2');
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.queryByLabelText('Remember this key')).toBeNull();
    expect(screen.getByText(/no API key needed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
  });

  it('renders the privacy caption', () => {
    useAiSettingsStore.setState({ mode: 'byok' });
    const { container } = render(<AiSettingsSection darkMode={false} />);

    expect(container.textContent).toContain('stored only in this browser');
    expect(container.textContent).toContain('never to our servers');
    expect(screen.queryByText(/Spend-limit hints/i)).toBeNull();
  });
});
