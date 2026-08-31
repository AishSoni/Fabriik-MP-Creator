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

export function HistoryPanel() {
  const history = useTemplateStore((s) => s.history);
  const restore = useTemplateStore((s) => s.restore);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectOnly = useEditorStore((s) => s.selectOnly);
  const [filterSelected, setFilterSelected] = useState(false);

  const entries = useMemo(() => {
    const all: RevisionEntry[] = Object.values(history).flat();
    all.sort((a, b) => b.timestamp - a.timestamp || b.baseRevision - a.baseRevision);
    if (!filterSelected || selectedIds.length === 0) return all;
    return all.filter((entry) => selectedIds.includes(entry.elementId));
  }, [history, filterSelected, selectedIds]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revisions</span>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filterSelected}
            disabled={selectedIds.length === 0}
            onChange={(e) => setFilterSelected(e.target.checked)}
          />
          Selected only
        </label>
      </div>
      {entries.length === 0 && (
        <p className="p-4 text-sm text-slate-500">No revisions yet. Edits appear here and can be restored per element.</p>
      )}
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SOURCE_STYLES[entry.source] ?? ''}`}>
                  {entry.source}
                </span>
                <button
                  type="button"
                  onClick={() => selectOnly(entry.elementId)}
                  className="cursor-pointer truncate font-mono text-xs text-blue-700 hover:underline"
                  title="Select this element"
                >
                  {entry.elementId}
                </button>
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                {entry.label} · scope: <span className="font-medium">{entry.scope}</span> · rev {entry.baseRevision}
              </div>
            </div>
            <button
              type="button"
              onClick={() => restore(entry)}
              aria-label={`Restore ${entry.elementId} ${entry.label}`}
              className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-blue-500 hover:text-blue-700"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
