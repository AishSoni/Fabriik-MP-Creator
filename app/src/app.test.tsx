import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { EditorShell } from './components/shell/EditorShell';
import { useTemplateStore } from './store/templateStore';
import { useEditorStore } from './store/editorStore';

describe('EditorShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useTemplateStore.getState().loadTemplate('tpl-editorial-v1');
    useEditorStore.getState().clearSelection();
    useEditorStore.getState().setActiveViewport('desktop');
  });

  it('renders the template inside the device frame', () => {
    render(<EditorShell />);
    const frame = screen.getByTestId('device-frame');
    expect(frame.querySelector('[data-eid="masthead-heading"]')).not.toBeNull();
    expect(frame.textContent).toContain('Design for the long stay.');
  });

  it('switches viewport', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.click(screen.getByRole('radio', { name: /Mobile/ }));
    expect(useEditorStore.getState().activeViewport).toBe('mobile');
  });
});

