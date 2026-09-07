import { useEffect } from 'react';
import { useTemplateStore } from '../store/templateStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .cm-editor, .cm-content',
    ),
  );
}

/**
 * Global document undo/redo shortcuts.
 *
 * - Undo: Ctrl/Cmd+Z
 * - Redo: Ctrl/Cmd+R (preventDefault blocks browser reload),
 *   plus Ctrl+Shift+Z and Ctrl+Y aliases.
 *
 * Skipped while focus is inside a text field or the CodeMirror surface so
 * native field-level undo keeps working there.
 */
export function useUndoRedoKeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const shift = e.shiftKey;

      if (key === 'z' && !shift) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        useTemplateStore.getState().undo();
        return;
      }

      if (key === 'r' || key === 'y' || (key === 'z' && shift)) {
        if (key !== 'r' && isEditableTarget(e.target)) return;
        e.preventDefault();
        useTemplateStore.getState().redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
