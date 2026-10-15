import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { EditorShell } from './EditorShell';
import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';

vi.mock('../code/CodePanel', () => ({
  CodePanel: () => null,
}));

function mockMobileScreen(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
  useEditorStore.getState().setRightPanelTab('properties');
  useEditorStore.getState().setToastMessage(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  // Remove the matchMedia mock so desktop jsdom defaults are restored.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).matchMedia;
});

describe('EditorShell mobile experience', () => {
  it('shows the nudge and collapses both sidebars on mobile', async () => {
    mockMobileScreen(true);
    render(<EditorShell />);

    expect(screen.getByTestId('mobile-experience-notice')).toBeInTheDocument();
    expect(screen.queryByLabelText('Layers')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editor side panel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show layers panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show side panel' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-continue-button'));
    expect(screen.queryByTestId('mobile-experience-notice')).not.toBeInTheDocument();
    // Sidebars stay collapsed after continuing; both remain reopenable.
    expect(screen.queryByLabelText('Layers')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editor side panel')).not.toBeInTheDocument();
  });

  it('keeps both sidebars open and hides the nudge on desktop', () => {
    mockMobileScreen(false);
    render(<EditorShell />);

    expect(screen.queryByTestId('mobile-experience-notice')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Layers')).toBeInTheDocument();
    expect(screen.getByLabelText('Editor side panel')).toBeInTheDocument();
  });

  it('lets a mobile user reopen both sidebars after continuing', async () => {
    mockMobileScreen(true);
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getByTestId('mobile-continue-button'));
    await user.click(screen.getByRole('button', { name: 'Show layers panel' }));
    await user.click(screen.getByRole('button', { name: 'Show side panel' }));

    expect(screen.getByLabelText('Layers')).toBeInTheDocument();
    expect(screen.getByLabelText('Editor side panel')).toBeInTheDocument();
  });
});
