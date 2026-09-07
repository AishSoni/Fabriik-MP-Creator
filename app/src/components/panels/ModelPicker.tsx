import { useEffect, useRef, useState } from 'react';
import { createLlmProvider } from '../../engine/ai/providers';
import type { ProviderId } from '../../engine/ai/providers/types';

const FALLBACK_STATUS = 'Could not load the model list — showing built-in defaults.';

interface ModelPickerProps {
  providerId: ProviderId;
  fallbackModels: readonly string[];
  currentModel: string;
  apiKey: string | null;
  onSelect: (model: string) => void;
  darkMode: boolean;
}

export function ModelPicker({
  providerId,
  fallbackModels,
  currentModel,
  apiKey,
  onSelect,
  darkMode,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<readonly string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, readonly string[]>());

  useEffect(() => {
    if (!open) return;
    const cached = cacheRef.current.get(providerId);
    if (cached) {
      setModels(cached);
      setStatus(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStatus(null);
    createLlmProvider(providerId)
      .listModels({ apiKey })
      .then((list) => {
        if (cancelled) return;
        const usable = list.filter((id) => id.length > 0);
        cacheRef.current.set(providerId, usable);
        setModels(usable);
      })
      .catch(() => {
        if (cancelled) return;
        setModels(null);
        setStatus(FALLBACK_STATUS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, providerId, apiKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const visible = (models ?? fallbackModels).filter((model) => model.toLowerCase().includes(needle));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="AI model"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-[13px] leading-5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${
          open
            ? 'border-accent'
            : darkMode
              ? 'border-white/10 bg-surface-dark text-paper hover:border-accent/40'
              : 'border-stone bg-surface text-ink hover:border-accent/40'
        }`}
      >
        <span className="truncate">{currentModel}</span>
        <span aria-hidden="true" className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          className={`absolute z-20 mt-1 w-full rounded-2xl border p-2 shadow-floating ${
            darkMode ? 'border-white/10 bg-surface-dark-raised' : 'border-stone bg-paper'
          }`}
        >
          <input
            aria-label="Search models"
            type="text"
            value={query}
            placeholder="Search models"
            onChange={(e) => setQuery(e.target.value)}
            className={`w-full rounded-xl border px-3 py-2 text-[13px] leading-5 placeholder:text-muted-dark focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${
              darkMode ? 'border-white/10 bg-surface-dark text-paper' : 'border-stone bg-surface text-ink'
            }`}
          />
          {loading && (
            <p className={`px-2 py-1.5 text-[11px] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>Loading models…</p>
          )}
          {status && (
            <p
              role="status"
              className={`mt-1 rounded-xl border border-amber-200/40 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900 ${
                darkMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : ''
              }`}
            >
              {status}
            </p>
          )}
          <ul role="listbox" aria-label="AI model options" className="mt-1 max-h-56 overflow-y-auto">
            {visible.map((model) => (
              <li key={model}>
                <button
                  type="button"
                  role="option"
                  aria-selected={model === currentModel}
                  onClick={() => {
                    onSelect(model);
                    setQuery('');
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
                    model === currentModel
                      ? 'bg-accent-soft font-semibold text-accent-strong'
                      : darkMode
                        ? 'text-stone hover:bg-surface/10'
                        : 'text-ink hover:bg-surface'
                  }`}
                >
                  <span className="truncate">{model}</span>
                  {model === currentModel && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
            {visible.length === 0 && !loading && (
              <li className={`px-2 py-1.5 text-[11px] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>No models match.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
