import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import { TEMPLATES } from '../../template';
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
  const darkMode = useEditorStore((s) => s.darkMode);
  const toggleDarkMode = useEditorStore((s) => s.toggleDarkMode);
  const isCompareOpen = useEditorStore((s) => s.isCompareOpen);
  const setCompareOpen = useEditorStore((s) => s.setCompareOpen);
  const resetDoc = useTemplateStore((s) => s.resetDoc);
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId);
  const loadTemplate = useTemplateStore((s) => s.loadTemplate);

  const handleTemplateSwitch = (nextId: string) => {
    if (nextId === activeTemplateId) return;
    const definition = TEMPLATES.find((t) => t.id === nextId);
    if (!definition) return;
    const confirmed = window.confirm(
      `Switch to “${definition.name}”? Your current edits and revision history will be discarded.`,
    );
    if (!confirmed) return;
    loadTemplate(nextId);
  };

  const scopeOptions: { id: Scope; label: string }[] = [
    { id: 'all', label: 'All views' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'mobile', label: 'Mobile' },
  ];

  return (
    <header
      className={`flex shrink-0 flex-wrap items-center gap-4 border-b px-4 py-2 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}
    >
      <span className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>Fabriik</span>

      <label className="flex items-center gap-2 text-sm">
        <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Template</span>
        <select
          aria-label="Active template"
          value={activeTemplateId}
          onChange={(e) => handleTemplateSwitch(e.target.value)}
          className={`max-w-52 rounded border px-2 py-1 focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
        >
          {TEMPLATES.map((definition) => (
            <option key={definition.id} value={definition.id} title={definition.description}>
              {definition.name}
            </option>
          ))}
        </select>
      </label>

      <div
        role="radiogroup"
        aria-label="Preview viewport"
        className={`flex items-center gap-1 rounded-lg p-1 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}
      >
        {VIEWPORT_LABELS.map(({ id, label, width }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={activeViewport === id}
            onClick={() => setActiveViewport(id)}
            className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium ${
              activeViewport === id
                ? darkMode
                  ? 'bg-slate-700 shadow text-blue-400'
                  : 'bg-white shadow text-blue-700'
                : darkMode
                  ? 'text-slate-400 hover:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label} <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>{width}px</span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Edit scope</span>
        <select
          aria-label="Edit scope"
          value={editScope}
          onChange={(e) => setEditScope(e.target.value as Scope)}
          className={`rounded border px-2 py-1 focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
        >
          {scopeOptions.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCompareOpen(!isCompareOpen)}
          aria-pressed={isCompareOpen}
          data-testid="compare-toggle"
          title={isCompareOpen ? 'Close compare view' : 'Compare base vs current'}
          className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold ${isCompareOpen ? (darkMode ? 'border-blue-500 bg-blue-600 text-white' : 'border-blue-600 bg-blue-600 text-white') : darkMode ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          Compare
        </button>
        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label="Toggle dark mode"
          aria-pressed={darkMode}
          data-testid="dark-mode-toggle"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`cursor-pointer rounded-md border p-1.5 text-sm leading-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          <span aria-hidden="true" className="text-base leading-none">
            {darkMode ? '☀️' : '🌙'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset the template and all history to its original state?')) resetDoc();
          }}
          className="cursor-pointer rounded-md border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          Reset template
        </button>
      </div>
    </header>
  );
}
