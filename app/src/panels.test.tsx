import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiDemoPanel } from './components/panels/AiDemoPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { useTemplateStore } from './store/templateStore';
import { useEditorStore } from './store/editorStore';
import { useReviewStore } from './store/reviewStore';
import { useAiSettingsStore } from './store/aiSettingsStore';
import { clearLlmProviderOverrides, setLlmProviderOverride } from './engine/ai/providers';
import { ProviderError } from './engine/ai/providers/types';

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

describe('AiDemoPanel', () => {
  it('runs a demo from example chips and accepts one proposal independently', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setSelection(['feature-1-title', 'feature-2-title']);
    render(<AiDemoPanel />);

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
    render(<AiDemoPanel />);
    const instructionBox = screen.getByLabelText('AI instruction');
    await user.clear(instructionBox);
    await user.type(instructionBox, 'Tell me a joke about pixels');
    await user.click(screen.getByRole('button', { name: /Run deterministic demo/i }));
    expect(screen.getByRole('alert').textContent).toContain('Unsupported instruction');
  });
});

describe('AiDemoPanel BYOK mode', () => {
  it('routes BYOK mode through the provider and surfaces proposals', async () => {
    const user = userEvent.setup();
    setLlmProviderOverride('gemini', fakeProvider(async () => ({ text: BYOK_FIXTURE })));
    useAiSettingsStore.setState({ mode: 'byok', providerId: 'gemini', modelId: null });
    useAiSettingsStore.getState().setKey('gemini', 'AIzaTestKey123456');
    useEditorStore.getState().selectOnly('hero-heading');
    render(<AiDemoPanel />);

    await user.click(screen.getByRole('button', { name: /Run AI \(bring your own key\)/i }));

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
    useAiSettingsStore.setState({ mode: 'byok', providerId: 'gemini', modelId: null });
    useAiSettingsStore.getState().setKey('gemini', 'AIzaTestKey123456');
    useEditorStore.getState().selectOnly('hero-heading');
    render(<AiDemoPanel />);

    await user.click(screen.getByRole('button', { name: /Run AI \(bring your own key\)/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Provider rejected your key');
  });
});

describe('HistoryPanel', () => {
  it('lists revisions per element and restores without touching siblings', async () => {
    const user = userEvent.setup();
    useTemplateStore.getState().dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: 0,
      stylePatch: { fontSize: 99 },
    });
    useTemplateStore.getState().dispatch({
      kind: 'set-content',
      source: 'ai',
      targetIds: ['footer-text'],
      scope: 'all',
      baseRevision: useTemplateStore.getState().doc.revision,
      content: { text: 'changed footer' },
    });

    render(<HistoryPanel />);
    expect(screen.getAllByRole('button', { name: /Restore hero-heading/ }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /Restore hero-heading/ })[0]);

    expect(useTemplateStore.getState().doc.elements['hero-heading'].style.base.fontSize).toBe(48);
    expect((useTemplateStore.getState().doc.elements['footer-text'].content.base as { text: string }).text).toBe(
      'changed footer',
    );
    expect(useTemplateStore.getState().history['hero-heading']).toHaveLength(2);
    expect(useTemplateStore.getState().history['hero-heading'][1].kind).toBe('restore');
  });
});
