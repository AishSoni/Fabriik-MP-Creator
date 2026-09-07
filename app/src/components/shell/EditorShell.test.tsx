import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShell } from './EditorShell';
import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';

vi.mock('../code/CodePanel', () => ({
  CodePanel: () => null,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
  useEditorStore.getState().setRightPanelTab('properties');
});

describe('EditorShell AI tab', () => {
  it('labels the AI tab "AI" and opens the AI panel from it', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    const tab = screen.getByRole('tab', { name: 'AI' });
    await user.click(tab);

    expect(useEditorStore.getState().rightPanelTab).toBe('ai');
    expect(await screen.findByRole('button', { name: 'Run deterministic demo' })).toBeInTheDocument();
  });
});
