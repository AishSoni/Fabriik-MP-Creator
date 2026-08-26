import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import type { Scope, Viewport } from '../../types/viewport';

const VIEWPORT_LABELS: { id: Viewport; label: string; width: number }[] = [
  { id: 'desktop', label: 'Desktop', width: 1440 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 375 },
];

export function TopBar() {
  const activeViewport = useEditorStore((s) => s.activeViewport);
  const setActiveViewport = useEditorStore((s) => s.setActiveViewport);
  const editScope = useEditorStore((s) => s.editScope);
  const setEditScope = useEditorStore((s) => s.setEditScope);
  const resetDoc = useTemplateStore((s) => s.resetDoc);

  const scopeOptions: { id: Scope; label: string }[] = [
    { id: 'all', label: 'All views' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'mobile', label: 'Mobile' },
  ];

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
      <span className="text-sm font-bold text-slate-800">Scoped Template Editor</span>

      <div role="radiogroup" aria-label="Preview viewport" className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {VIEWPORT_LABELS.map(({ id, label, width }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={activeViewport === id}
            onClick={() => setActiveViewport(id)}
            className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium ${
              activeViewport === id ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label} <span className="text-xs text-slate-400">{width}px</span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-600">Edit scope</span>
        <select
          aria-label="Edit scope"
          value={editScope}
          onChange={(e) => setEditScope(e.target.value as Scope)}
          className="rounded border border-slate-300 bg-white px-2 py-1 focus:border-blue-500 focus:outline-none"
        >
          {scopeOptions.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset the template and all history to its original state?')) resetDoc();
          }}
          className="cursor-pointer rounded-md border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Reset template
        </button>
      </div>
    </header>
  );
}
