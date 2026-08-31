import { useMemo, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import type { RevisionEntry } from '../../types/commands';

const SOURCE_STYLES: Record<string, string> = {
  canvas: 'bg-slate-100 text-slate-700',
  code: 'bg-amber-100 text-amber-700',
  ai: 'bg-violet-100 text-violet-700',
  restore: 'bg-emerald-100 text-emerald-700',
};

const SOURCE_STYLES_DARK: Record<string, string> = {
  canvas: 'bg-slate-700 text-slate-300',
  code: 'bg-amber-900/40 text-amber-300',
  ai: 'bg-violet-900/40 text-violet-300',
  restore: 'bg-emerald-900/40 text-emerald-300',
};

export function HistoryPanel() {
  const history = useTemplateStore((s) => s.history);
  const restore = useTemplateStore((s) => s.restore);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectOnly = useEditorStore((s) => s.selectOnly);
  const darkMode = useEditorStore((s) => s.darkMode);
  const [filterSelected, setFilterSelected] = useState(false);

  const entries = useMemo(() => {
    const all: RevisionEntry[] = Object.values(history).flat();
    all.sort((a, b) => b.timestamp - a.timestamp || b.baseRevision - a.baseRevision);
    if (!filterSelected || selectedIds.length === 0) return all;
    return all.filter((entry) => selectedIds.includes(entry.elementId));
  }, [history, filterSelected, selectedIds]);

  const sourceStyles = darkMode ? SOURCE_STYLES_DARK : SOURCE_STYLES;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex shrink-0 items-center justify-between border-b px-3 py-2 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Revisions</span>
        <label className={`flex items-center gap-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          <input
            type="checkbox"
            checked={filterSelected}
            disabled={selectedIds.length === 0}
            onChange={(e) => setFilterSelected(e.target.checked)}
            className={darkMode ? 'accent-blue-500' : ''}
          />
          Selected only
        </label>
      </div>
      {entries.length === 0 && (
        <p className={`p-4 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No revisions yet. Edits appear here and can be restored per element.</p>
      )}
      <ul className={`min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${sourceStyles[entry.source] ?? ''}`}>
                  {entry.source}
                </span>
                <button
                  type="button"
                  onClick={() => selectOnly(entry.elementId)}
                  className={`cursor-pointer truncate font-mono text-xs hover:underline ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}
                  title="Select this element"
                >
                  {entry.elementId}
                </button>
              </div>
              <div className={`mt-0.5 truncate text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {entry.label} · scope: <span className="font-medium">{entry.scope}</span> · rev {entry.baseRevision}
              </div>
            </div>
            <button
              type="button"
              onClick={() => restore(entry)}
              aria-label={`Restore ${entry.elementId} ${entry.label}`}
              className={`cursor-pointer rounded border px-2 py-1 text-xs font-medium ${darkMode ? 'border-slate-600 text-slate-300 hover:border-blue-500 hover:text-blue-400' : 'border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-700'}`}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
