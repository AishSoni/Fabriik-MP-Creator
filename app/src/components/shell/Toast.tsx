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
        className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-[0_12px_32px_rgba(14,14,16,0.14),0_4px_12px_rgba(14,14,16,0.08)] backdrop-blur-xl ${
          darkMode ? 'border-[#262629] bg-[#1E1E20]/90 text-[#FDFBF7]' : 'border-[#E7E5E0] bg-white/95 text-[#0E0E10]'
        }`}
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7868E6] text-white">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2.2 5L4 6.8L7.8 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {toastMessage}
      </div>
    </div>
  );
}
