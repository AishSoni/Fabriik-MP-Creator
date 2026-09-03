import { useMemo, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import type { RevisionEntry } from '../../types/commands';

const SOURCE_BADGE: Record<string, string> = {
  canvas: 'bg-[#E7E5E0] text-[#3A3938] dark:bg-white/10 dark:text-[#9A9996]',
  code: 'bg-[#FCE8C3] text-[#8A5A00] dark:bg-amber-500/15 dark:text-amber-200',
  ai: 'bg-[#ECE9FF] text-[#6354D9] dark:bg-[#7868E6]/20 dark:text-[#A99CFF]',
  restore: 'bg-[#D1F0E6] text-[#0E7A5B] dark:bg-emerald-500/15 dark:text-emerald-200',
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-b px-3.5 py-3 ${darkMode ? 'border-white/10 bg-[#141416]' : 'border-[#E7E5E0] bg-[#FDFBF7]'}`}
      >
        <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Revisions</span>
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${filterSelected ? (darkMode ? 'border-[#7868E6] bg-[#7868E6] text-white' : 'border-[#7868E6] bg-[#7868E6] text-white') : darkMode ? 'border-white/10 bg-white/5 text-[#9A9996] hover:bg-white/10' : 'border-[#E7E5E0] bg-white text-[#6B6A68] hover:bg-[#FDFBF7]'} ${selectedIds.length === 0 ? 'opacity-50' : ''}`}
          title={selectedIds.length === 0 ? 'Select an element to filter' : undefined}
        >
          <input
            type="checkbox"
            checked={filterSelected}
            disabled={selectedIds.length === 0}
            onChange={(e) => setFilterSelected(e.target.checked)}
            className="sr-only"
          />
          <span className={`h-2 w-2 rounded-full ${filterSelected ? 'bg-white' : 'bg-[#9A9996]'}`} />
          Selected only
        </label>
      </div>
      {entries.length === 0 && (
        <div className="p-6">
          <div
            className={`rounded-[20px] border border-dashed p-6 text-center text-sm leading-6 ${darkMode ? 'border-white/10 bg-white/[0.04] text-[#9A9996]' : 'border-[#E7E5E0] bg-white text-[#6B6A68]'}`}
          >
            No revisions yet. Edits appear here and can be restored per element.
          </div>
        </div>
      )}
      <ul className={`min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 ${darkMode ? 'bg-[#141416]' : 'bg-[#FDFBF7]'}`}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`group flex items-start gap-3 rounded-[18px] border p-3 transition-all duration-200 ${darkMode ? 'border-white/10 bg-[#1E1E20] hover:border-white/15 hover:bg-[#262629]' : 'border-[#E7E5E0] bg-white shadow-[0_1px_2px_rgba(22,22,24,0.06)] hover:shadow-[0_4px_16px_rgba(22,22,24,0.08)] hover:border-[#D9D6D1]'}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${SOURCE_BADGE[entry.source] ?? 'bg-[#E7E5E0] text-[#6B6A68]'}`}>{entry.source}</span>
                <button
                  type="button"
                  onClick={() => selectOnly(entry.elementId)}
                  className={`cursor-pointer truncate rounded-full px-2 py-1 font-mono text-xs font-medium transition-colors ${darkMode ? 'bg-white/5 text-[#A99CFF] hover:bg-[#7868E6] hover:text-white' : 'bg-[#F3EFE8] text-[#6354D9] hover:bg-[#0E0E10] hover:text-white'}`}
                  title="Select this element"
                >
                  {entry.elementId}
                </button>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${darkMode ? 'bg-white/5 text-[#9A9996]' : 'bg-[#FDFBF7] text-[#6B6A68] border border-[#E7E5E0]'}`}>
                  rev {entry.baseRevision}
                </span>
              </div>
              <div className={`mt-2 truncate text-xs leading-5 ${darkMode ? 'text-[#9A9996]' : 'text-[#3A3938]'}`}>
                <span className="font-medium">{entry.label}</span>
                <span className="mx-1.5 opacity-40">·</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${darkMode ? 'bg-white/5 text-[#E7E5E0]' : 'bg-[#0E0E10] text-white'}`}>{entry.scope}</span>
              </div>
              <div className={`mt-1 text-[11px] tabular-nums ${darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}>{new Date(entry.timestamp).toLocaleString()}</div>
            </div>
            <button
              type="button"
              onClick={() => restore(entry)}
              aria-label={`Restore ${entry.elementId} ${entry.label}`}
              className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${darkMode ? 'bg-[#FDFBF7] text-[#0E0E10] hover:bg-white' : 'bg-[#0E0E10] text-white hover:bg-[#1A1A1E] shadow-sm'}`}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
