import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorShell } from './components/shell/EditorShell';
import { useTemplateStore } from './store/templateStore';
import { useEditorStore } from './store/editorStore';

beforeEach(() => {
  localStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
  useEditorStore.getState().clearSelection();
});

describe('multi-template journey', () => {
  it('switches templates from the picker and clears history', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditorShell />);

    useTemplateStore.getState().dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: useTemplateStore.getState().doc.revision,
      stylePatch: { fontSize: 88 },
    });
    expect(Object.keys(useTemplateStore.getState().history)).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Active template'), 'tpl-saas-v1');

    expect(confirmSpy).toHaveBeenCalledOnce();
    const state = useTemplateStore.getState();
    expect(state.doc.templateId).toBe('tpl-saas-v1');
    expect(state.history).toEqual({});
    expect(screen.getByTestId('device-frame').textContent).toContain('Run your whole back office');

    confirmSpy.mockRestore();
  });

  it('declining the confirmation keeps the current template', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EditorShell />);

    await user.selectOptions(screen.getByLabelText('Active template'), 'tpl-bistro-v1');

    expect(useTemplateStore.getState().doc.templateId).toBe('tpl-landing-v1');
    expect(useTemplateStore.getState().activeTemplateId).toBe('tpl-landing-v1');
    confirmSpy.mockRestore();
  });

  it('renders the portfolio fixture with its own elements after switching', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditorShell />);

    await user.selectOptions(screen.getByLabelText('Active template'), 'tpl-portfolio-v1');
    const frame = screen.getByTestId('device-frame');
    expect(frame.querySelector('[data-eid="intro-heading"]')).not.toBeNull();
    expect(useEditorStore.getState().selectedIds).toEqual([]);
    confirmSpy.mockRestore();
  });
});
