import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUndoRedoKeys } from './useUndoRedoKeys';
import { useTemplateStore } from '../store/templateStore';
import type { EditCommand } from '../types/commands';

vi.mock('../components/code/CodePanel', () => ({
  CodePanel: () => null,
}));

function Host() {
  useUndoRedoKeys();
  return (
    <div>
      <input aria-label="field" />
      <div data-testid="headline">
        {(useTemplateStore((s) => s.doc.elements['hero-heading'].content.base as { text: string }).text)}
      </div>
    </div>
  );
}

const state = () => useTemplateStore.getState();

beforeEach(() => {
  localStorage.clear();
  state().loadTemplate('tpl-landing-v1');
});

function editHeadline(text: string) {
  const errors = state().dispatch({
    kind: 'set-content',
    source: 'canvas',
    targetIds: ['hero-heading'],
    scope: 'all',
    baseRevision: state().doc.revision,
    content: { text },
  } as EditCommand);
  expect(errors).toEqual([]);
}

describe('useUndoRedoKeys', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+R', () => {
    render(<Host />);
    const original = screen.getByTestId('headline').textContent;
    act(() => editHeadline('Keyboard edit'));
    expect(screen.getByTestId('headline').textContent).toBe('Keyboard edit');

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe(original);

    const preventSpy = vi.fn();
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e as KeyboardEvent).ctrlKey && (e as KeyboardEvent).key.toLowerCase() === 'r') {
          preventSpy((e as KeyboardEvent).defaultPrevented);
        }
      },
      { once: true },
    );
    act(() => {
      fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe('Keyboard edit');
    expect(preventSpy).toHaveBeenCalledWith(true);
  });

  it('supports Ctrl+Shift+Z and Ctrl+Y redo aliases', () => {
    render(<Host />);
    act(() => editHeadline('Alias edit'));

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe('Alias edit');

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe('Alias edit');
  });

  it('lets text fields keep native undo but still allows Ctrl+R redo', () => {
    render(<Host />);
    const original = screen.getByTestId('headline').textContent;
    act(() => editHeadline('Guarded edit'));

    const field = screen.getByLabelText('field') as HTMLInputElement;
    act(() => {
      field.focus();
      fireEvent.keyDown(field, { key: 'z', ctrlKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe('Guarded edit');

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe(original);

    act(() => {
      field.focus();
      fireEvent.keyDown(field, { key: 'r', ctrlKey: true });
    });
    expect(screen.getByTestId('headline').textContent).toBe('Guarded edit');
  });
});
