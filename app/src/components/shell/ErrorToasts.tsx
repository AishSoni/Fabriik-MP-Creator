import { useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';

export function ErrorToasts() {
  const lastErrors = useTemplateStore((s) => s.lastErrors);
  const darkMode = useEditorStore((s) => s.darkMode);
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (lastErrors.length === 0) return null;
  const signature = lastErrors.map((e) => e.message).join('|');
  if (signature === dismissed) return null;

  return (
    <div
      role="alert"
      className={`mx-3 mt-3 flex shrink-0 items-start justify-between gap-3 rounded-[14px] border px-4 py-3 text-sm shadow-[0_8px_24px_rgba(14,14,16,0.08)] ${
        darkMode ? 'border-[#3A2020] bg-[#1E1A1A] text-[#E8A0A0]' : 'border-[#E8D0D0] bg-[#FFF5F5] text-[#8B2E24]'
      }`}
    >
      <div className="min-w-0">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#E8A0A0]' : 'text-[#A33A2E]'}`}>Validation</p>
        <ul className="mt-1 list-disc pl-4 text-[13px] leading-5">
          {lastErrors.slice(0, 3).map((error, i) => (
            <li key={i}>
              <span className="font-semibold">{error.code}</span>: {error.message}
            </li>
          ))}
          {lastErrors.length > 3 && <li>…and {lastErrors.length - 3} more</li>}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(signature)}
        className={`cursor-pointer shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
          darkMode ? 'border-[#3A2020] bg-[#2A1A1A] text-[#E8A0A0] hover:bg-[#3A2020]' : 'border-[#E8D0D0] bg-white text-[#8B2E24] hover:bg-[#FFF0F0]'
        }`}
      >
        Dismiss
      </button>
    </div>
  );
}
