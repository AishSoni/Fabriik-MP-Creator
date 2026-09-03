import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import { TEMPLATES } from '../../template';
import { getTemplateById } from '../../template';
import { getChangedIds } from '../compare/CompareView';
import { FileMenu } from './FileMenu';
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
  const setToastMessage = useEditorStore((s) => s.setToastMessage);
  const resetDoc = useTemplateStore((s) => s.resetDoc);
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId);
  const loadTemplate = useTemplateStore((s) => s.loadTemplate);
  const doc = useTemplateStore((s) => s.doc);

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
      className={`flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4 ${
        darkMode ? 'border-[#262629] bg-[#141416]' : 'border-[#E7E5E0] bg-[#FDFBF7]/80 backdrop-blur-xl'
      }`}
      style={{ minHeight: 56 }}
    >
      <FileMenu />

      <div className={`hidden h-6 w-px shrink-0 sm:block ${darkMode ? 'bg-[#262629]' : 'bg-[#E7E5E0]'}`} />

      {/* Template */}
      <label className="flex items-center gap-2 text-sm">
        <span
          className={`hidden text-[11px] font-semibold uppercase tracking-[0.08em] sm:inline ${
            darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'
          }`}
        >
          Template
        </span>
        <select
          aria-label="Active template"
          value={activeTemplateId}
          onChange={(e) => handleTemplateSwitch(e.target.value)}
          className={`max-w-[168px] cursor-pointer rounded-full border px-3 py-1.5 pr-7 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] focus:border-transparent appearance-none ${
            darkMode
              ? 'border-[#2A2A30] bg-[#1E1E20] text-[#FDFBF7] hover:bg-[#262629]'
              : 'border-[#E7E5E0] bg-white text-[#0E0E10] hover:border-[#D9D6D1] shadow-[0_1px_2px_rgba(14,14,16,0.04)]'
          }`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='${darkMode ? '%239A9996' : '%236B6A68'}' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
          }}
        >
          {!TEMPLATES.some((definition) => definition.id === activeTemplateId) && (
            <option value={activeTemplateId} title="Imported template">
              {`${doc.templateName} (imported)`}
            </option>
          )}
          {TEMPLATES.map((definition) => (
            <option key={definition.id} value={definition.id} title={definition.description}>
              {definition.name}
            </option>
          ))}
        </select>
      </label>

      {/* Viewport segmented */}
      <div
        role="radiogroup"
        aria-label="Preview viewport"
        className={`hidden items-center gap-0.5 rounded-full p-1 md:flex ${darkMode ? 'bg-[#1E1E20] border border-[#262629]' : 'bg-white border border-[#E7E5E0] shadow-[0_1px_2px_rgba(14,14,16,0.04)]'}`}
      >
        {VIEWPORT_LABELS.map(({ id, label, width }) => {
          const active = activeViewport === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setActiveViewport(id)}
              className={`cursor-pointer rounded-full px-3 py-1 text-[13px] font-medium transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                active
                  ? darkMode
                    ? 'bg-[#FDFBF7] text-[#0E0E10] shadow-sm'
                    : 'bg-[#0E0E10] text-white shadow-sm'
                  : darkMode
                    ? 'text-[#9A9996] hover:text-[#FDFBF7]'
                    : 'text-[#6B6A68] hover:text-[#0E0E10]'
              }`}
            >
              <span>{label}</span>{' '}
              <span
                className={`font-mono text-[11px] tabular-nums ${active ? (darkMode ? 'text-[#0E0E10]/60' : 'text-white/60') : darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}
              >
                {width}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile viewport fallback */}
      <div className="flex items-center gap-1 md:hidden">
        {VIEWPORT_LABELS.map(({ id }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeViewport === id}
            onClick={() => setActiveViewport(id)}
            className={`h-7 w-7 rounded-full text-[11px] font-semibold uppercase ${activeViewport === id ? (darkMode ? 'bg-white text-[#0E0E10]' : 'bg-[#0E0E10] text-white') : darkMode ? 'bg-[#1E1E20] text-[#9A9996]' : 'bg-white border border-[#E7E5E0] text-[#6B6A68]'}`}
          >
            {id[0]}
          </button>
        ))}
      </div>

      {/* Scope */}
      <label className="hidden items-center gap-2 text-sm lg:flex">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Scope</span>
        <select
          aria-label="Edit scope"
          value={editScope}
          onChange={(e) => setEditScope(e.target.value as Scope)}
          className={`cursor-pointer rounded-full border px-3 py-1.5 pr-7 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] focus:border-transparent appearance-none ${
            darkMode
              ? 'border-[#2A2A30] bg-[#1E1E20] text-[#FDFBF7]'
              : 'border-[#E7E5E0] bg-white text-[#0E0E10] shadow-[0_1px_2px_rgba(14,14,16,0.04)]'
          }`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='${darkMode ? '%239A9996' : '%236B6A68'}' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
          }}
        >
          {scopeOptions.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (isCompareOpen) {
              setCompareOpen(false);
              return;
            }
            const baseDoc = getTemplateById(activeTemplateId)?.create() ?? doc;
            const changedIds = getChangedIds(baseDoc, doc);
            if (changedIds.length === 0) {
              setToastMessage('There are no changes');
              return;
            }
            setCompareOpen(true);
          }}
          aria-pressed={isCompareOpen}
          data-testid="compare-toggle"
          title={isCompareOpen ? 'Close compare view' : 'Compare base vs current'}
          className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] ${
            isCompareOpen
              ? 'border-[#7868E6] bg-[#7868E6] text-white shadow-[0_4px_12px_rgba(120,104,230,0.3)]'
              : darkMode
                ? 'border-[#2A2A30] bg-[#1E1E20] text-[#FDFBF7] hover:bg-[#262629] hover:border-[#3A3A40]'
                : 'border-[#E7E5E0] bg-white text-[#0E0E10] hover:bg-[#FDFBF7] hover:border-[#D9D6D1] shadow-[0_1px_2px_rgba(14,14,16,0.04)]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isCompareOpen ? 'bg-white' : 'bg-[#7868E6]'}`} />
          Compare
        </button>

        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label="Toggle dark mode"
          aria-pressed={darkMode}
          data-testid="dark-mode-toggle"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            darkMode ? 'border-[#2A2A30] bg-[#1E1E20] text-[#FDFBF7] hover:bg-[#262629]' : 'border-[#E7E5E0] bg-white text-[#0E0E10] hover:bg-[#FDFBF7]'
          }`}
        >
          <span aria-hidden="true" className="text-[14px] leading-none">
            {darkMode ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2" />
                <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.9 2.9l.7.7M10.4 10.4l.7.7M10.4 3.6l.7-.7M2.9 11.1l.7-.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M11.5 7.2A4.5 4.5 0 0 1 6.8 2.5 4.5 4.5 0 1 0 11.5 7.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset the template and all history to its original state?')) resetDoc();
          }}
          className={`hidden cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors sm:inline-flex ${
            darkMode
              ? 'border-[#3A2020] bg-[#1E1E20] text-[#E8A0A0] hover:bg-[#2A1A1A] hover:text-[#FFB4B4]'
              : 'border-[#E8D0D0] bg-white text-[#A33A2E] hover:bg-[#FDF2F2] hover:border-[#E0B8B8]'
          }`}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
