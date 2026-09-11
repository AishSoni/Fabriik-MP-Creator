import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryPanel } from './HistoryPanel';
import { useTemplateStore } from '../../store/templateStore';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
});

describe('HistoryPanel', () => {
  it('lists revisions per element and restores without touching siblings', async () => {
    const user = userEvent.setup();
    useTemplateStore.getState().dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      stylePatch: { fontSize: 99 },
    });
    useTemplateStore.getState().dispatch({
      kind: 'set-content',
      source: 'ai',
      targetIds: ['footer-text'],
      scope: 'all',
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
