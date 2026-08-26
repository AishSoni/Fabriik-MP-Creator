import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { EditorShell } from './components/shell/EditorShell';
import { useTemplateStore } from './store/templateStore';
import { useEditorStore } from './store/editorStore';

describe('EditorShell', () => {
  beforeEach(() => {
    useTemplateStore.getState().resetDoc();
    useEditorStore.getState().clearSelection();
    useEditorStore.getState().setActiveViewport('desktop');
    localStorage.clear();
  });

  it('renders the template inside the device frame', () => {
    render(<EditorShell />);
    const frame = screen.getByTestId('device-frame');
    expect(frame.querySelector('[data-eid="hero-heading"]')).not.toBeNull();
    expect(frame.textContent).toContain('Main Hero Message to Sell Yourself!');
  });

  it('switches viewport', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.click(screen.getByRole('radio', { name: /Mobile/ }));
    expect(useEditorStore.getState().activeViewport).toBe('mobile');
  });
});

