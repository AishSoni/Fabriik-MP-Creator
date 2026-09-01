import { useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';

export function Toast() {
  const toastMessage = useEditorStore((s) => s.toastMessage);
  const setToastMessage = useEditorStore((s) => s.setToastMessage);
  const darkMode = useEditorStore((s) => s.darkMode);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(id);
  }, [toastMessage, setToastMessage]);

  if (!toastMessage) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center px-4"
    >
      <div
        className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm font-medium shadow-xl ${
          darkMode
            ? 'border-slate-700 bg-slate-800 text-slate-100'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        {toastMessage}
      </div>
    </div>
  );
}
