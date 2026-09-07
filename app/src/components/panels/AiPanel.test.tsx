import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiPanel } from './AiPanel';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import { useReviewStore } from '../../store/reviewStore';
import { useAiSettingsStore } from '../../store/aiSettingsStore';
import { clearLlmProviderOverrides, setLlmProviderOverride } from '../../engine/ai/providers';
import { ProviderError } from '../../engine/ai/providers/types';

const BYOK_FIXTURE = JSON.stringify({
  proposals: [
    {
      targetId: 'hero-heading',
      explanation: 'Rewrite the headline',
      command: { kind: 'set-content', targetIds: ['hero-heading'], content: { text: 'Powered by your own key' } },
    },
  ],
});

function fakeProvider(complete: () => Promise<{ text: string }>) {
  return {
    id: 'gemini' as const,
    label: 'Google Gemini',
    requiresKey: true,
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash'],
    complete,
    listModels: async () => ['gemini-2.5-flash'],
  };
}

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

function seedByokMode() {
  useAiSettingsStore.setState({ mode: 'byok', providerId: 'gemini', modelId: null });
  useAiSettingsStore.getState().setKey('gemini', 'AIzaTestKey123456');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearLlmProviderOverrides();
  resetAiSettings();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
  useEditorStore.getState().clearSelection();
  useReviewStore.getState().setPendingResult(null);
});

afterEach(() => {
  clearLlmProviderOverrides();
});

describe('AiPanel', () => {
  it('runs a demo from example chips and accepts one proposal independently', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setSelection(['feature-1-title', 'feature-2-title']);
    render(<AiPanel />);

    await user.click(screen.getByRole('button', { name: 'Autofill Bold everything selected' }));
    await user.click(screen.getByRole('button', { name: /Run deterministic demo/i }));
    const cards = screen.getAllByText(/Accept/);
    expect(cards.length).toBeGreaterThanOrEqual(2);

    const before = useTemplateStore.getState().doc.elements['feature-1-title'].style.base.fontWeight;
    expect(before).toBe(700);

    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
    expect(useTemplateStore.getState().doc.elements['feature-1-title'].style.base.fontWeight).toBe(800);
    expect(useTemplateStore.getState().doc.elements['feature-2-title'].style.base.fontWeight).toBe(700);
    expect(screen.getByTestId('review-summary').textContent).toContain('1 accepted');
  });

  it('shows an explicit error card for unsupported instructions', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().selectOnly('hero-heading');
    render(<AiPanel />);
    const instructionBox = screen.getByLabelText('AI instruction');
    await user.clear(instructionBox);
    await user.type(instructionBox, 'Tell me a joke about pixels');
    await user.click(screen.getByRole('button', { name: /Run deterministic demo/i }));
    expect(screen.getByRole('alert').textContent).toContain('Unsupported instruction');
  });
});

describe('AiPanel BYOK mode', () => {
  it('routes BYOK mode through the provider and surfaces proposals', async () => {
    const user = userEvent.setup();
    setLlmProviderOverride('gemini', fakeProvider(async () => ({ text: BYOK_FIXTURE })));
    seedByokMode();
    useEditorStore.getState().selectOnly('hero-heading');
    render(<AiPanel />);

    await user.click(screen.getByRole('button', { name: 'Run AI' }));

    await screen.findByText('Powered by your own key');
    const result = useReviewStore.getState().pendingResult;
    expect(result?.proposals).toHaveLength(1);
    expect(result?.proposals[0].targetId).toBe('hero-heading');
    expect(result?.error).toBeUndefined();
  });

  it('surfaces provider errors through the existing proposal-error UI', async () => {
    const user = userEvent.setup();
    setLlmProviderOverride(
      'gemini',
      fakeProvider(async () => {
        throw new ProviderError('auth', 'API key not valid');
      }),
    );
    seedByokMode();
    useEditorStore.getState().selectOnly('hero-heading');
    render(<AiPanel />);

    await user.click(screen.getByRole('button', { name: 'Run AI' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Provider rejected your key');
  });

  it('hides the examples gallery in BYOK mode and labels the run button "Run AI"', () => {
    seedByokMode();
    useEditorStore.getState().selectOnly('hero-heading');
    render(<AiPanel />);

    expect(screen.queryByTestId('example-gallery')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run AI' })).toBeInTheDocument();
  });

  it('shows spend-limit hints at the bottom of the panel only in BYOK mode', () => {
    const demo = render(<AiPanel />);
    expect(screen.queryByText(/Spend-limit hints/i)).not.toBeInTheDocument();
    demo.unmount();

    seedByokMode();
    const byok = render(<AiPanel />);
    const root = byok.container.firstElementChild as HTMLElement;
    expect(screen.getByText(/Spend-limit hints/i)).toBeInTheDocument();
    expect(root.lastElementChild?.textContent).toContain('Spend-limit hints');
    expect(root.lastElementChild?.textContent).toContain('platform.openai.com');
  });
});
