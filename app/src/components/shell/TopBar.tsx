import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import { TEMPLATES } from '../../template';
import { getTemplateById } from '../../template';
import { getChangedIds } from '../compare/CompareView';
import { Dropdown } from './Dropdown';
import { FileMenu } from './FileMenu';
import {
  attachRoomProvider,
  detachRoomProvider,
  isRoomActive,
} from '../../store/templateStore';
import {
  clearRoomFromUrl,
  getCollabHost,
  newRoomId,
  shareUrlFor,
  writeRoomToUrl,
} from '../../collab/room';
import type { Scope, Viewport } from '../../types/viewport';
import { cn } from '../../lib/cn';
import { viewportPillVariants } from '../../lib/variants';

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
  const undo = useTemplateStore((s) => s.undo);
  const redo = useTemplateStore((s) => s.redo);
  const canUndo = useTemplateStore((s) => s.past.length > 0);
  const canRedo = useTemplateStore((s) => s.future.length > 0);
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId);
  const loadTemplate = useTemplateStore((s) => s.loadTemplate);
  const doc = useTemplateStore((s) => s.doc);
  const roomActive = useEditorStore((s) => s.roomActive);
  const setRoomActive = useEditorStore((s) => s.setRoomActive);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

  const handleTemplateSwitch = (nextId: string) => {
    if (roomActive) {
      setToastMessage('Template switching is unavailable while sharing a room');
      return;
    }
    if (nextId === activeTemplateId) return;
    const definition = TEMPLATES.find((t) => t.id === nextId);
    if (!definition) return;
    const confirmed = window.confirm(
      `Switch to “${definition.name}”? Your current edits and revision history will be discarded.`,
    );
    if (!confirmed) return;
    loadTemplate(nextId);
  };

  const handleShare = () => {
    if (isRoomActive()) {
      if (!window.confirm('Leave the shared room? You will keep your current edits locally.')) return;
      detachRoomProvider();
      clearRoomFromUrl();
      setRoomActive(false);
      setToastMessage('Left the shared room');
      return;
    }
    const room = newRoomId();
    attachRoomProvider(getCollabHost(), room, { role: 'create' });
    writeRoomToUrl(room);
    setRoomActive(true);
    void navigator.clipboard
      ?.writeText(shareUrlFor(room))
      ?.catch(() => {});
    setToastMessage('Room created — invite link copied');
  };

  const scopeOptions: { id: Scope; label: string }[] = [
    { id: 'all', label: 'All views' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'mobile', label: 'Mobile' },
  ];

  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4',
        darkMode ? 'border-surface-dark-muted bg-surface-dark' : 'border-stone bg-paper/80 backdrop-blur-xl',
      )}
      style={{ minHeight: 56 }}
    >
      <FileMenu />
      <div className={cn('hidden h-6 w-px shrink-0 sm:block', darkMode ? 'bg-surface-dark-muted' : 'bg-stone')} />

      {/* Template — Dropdown */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            'hidden text-[11px] font-semibold uppercase tracking-[0.08em] sm:inline',
            darkMode ? 'text-muted-dark' : 'text-muted',
          )}
        >
          Template
        </span>
        <Dropdown
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          label="Template selector"
          widthClass="w-72"
          testId="template-dropdown"
          menuTestId="template-menu"
          trigger={
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={templateOpen}
              aria-label="Open template menu"
              data-testid="template-trigger"
              onClick={() => setTemplateOpen((v) => !v)}
              className={cn(
                'inline-flex max-w-[168px] cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-ring focus:border-transparent',
                darkMode
                  ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
                  : 'border-stone bg-surface text-ink hover:border-stone-2 shadow-sm',
              )}
            >
              <span className="truncate">
                {!TEMPLATES.some((d) => d.id === activeTemplateId)
                  ? `${doc.templateName} (imported)`
                  : (TEMPLATES.find((d) => d.id === activeTemplateId)?.name ?? 'Template')}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
                className={cn(
                  'shrink-0 transition-transform duration-200',
                  templateOpen && 'rotate-180',
                  darkMode ? 'text-muted-dark' : 'text-muted',
                )}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
        >
          <div className={cn('rounded-[10px] px-3 py-2', darkMode ? 'bg-surface-dark' : 'bg-paper')}>
            <p
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.08em]',
                darkMode ? 'text-muted-dark' : 'text-muted',
              )}
            >
              Switch template
            </p>
            <p className={cn('text-[11px]', darkMode ? 'text-muted' : 'text-muted-dark')}>Edits and history will be discarded</p>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 p-1">
            {!TEMPLATES.some((d) => d.id === activeTemplateId) && (
              <button
                type="button"
                role="menuitem"
                aria-selected={true}
                onClick={() => setTemplateOpen(false)}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium',
                  darkMode ? 'bg-accent/20 text-accent-ring' : 'bg-accent-soft text-accent-strong',
                )}
              >
                <span className="truncate">{`${doc.templateName} (imported)`}</span>
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', darkMode ? 'bg-accent-ring' : 'bg-accent')} />
              </button>
            )}
            {TEMPLATES.map((definition) => {
              const active = definition.id === activeTemplateId;
              return (
                <button
                  key={definition.id}
                  type="button"
                  role="menuitem"
                  aria-selected={active}
                  data-testid={`template-option-${definition.id}`}
                  onClick={() => {
                    setTemplateOpen(false);
                    handleTemplateSwitch(definition.id);
                  }}
                  title={definition.description}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium transition-colors',
                    active
                      ? darkMode
                        ? 'bg-paper text-ink'
                        : 'bg-ink text-white'
                      : darkMode
                        ? 'text-paper hover:bg-white/[0.06]'
                        : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  <span className="truncate">{definition.name}</span>
                  {active ? (
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', darkMode ? 'bg-ink' : 'bg-white')} />
                  ) : (
                    <span className={cn('hidden sm:inline truncate text-xs font-normal', darkMode ? 'text-muted-dark' : 'text-muted')}>
                      {definition.description.slice(0, 28)}…
                    </span>
                  )}
                </button>
              );
            })}
            <div className={cn('my-1 h-px', darkMode ? 'bg-white/10' : 'bg-stone')} />
            <button
              type="button"
              role="menuitem"
              disabled
              aria-disabled="true"
              title="Template Library — Coming soon"
              data-testid="template-library-coming-soon"
              className={cn(
                'flex cursor-not-allowed items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium opacity-60',
                darkMode ? 'text-muted-dark' : 'text-muted',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full', darkMode ? 'bg-white/10' : 'bg-stone')}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M3 3.5h6M3 6h6M3 8.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </span>
                Template Library
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  darkMode ? 'bg-white/10 text-muted-dark' : 'bg-surface-muted text-muted',
                )}
              >
                Coming soon
              </span>
            </button>
          </div>
        </Dropdown>
        {/* Hidden native select for a11y + test compatibility (user.selectOptions) */}
        <select
          aria-label="Active template"
          data-testid="template-native-select"
          value={activeTemplateId}
          onChange={(e) => handleTemplateSwitch(e.target.value)}
          className="sr-only"
          tabIndex={-1}
        >
          {!TEMPLATES.some((d) => d.id === activeTemplateId) && (
            <option value={activeTemplateId}>{`${doc.templateName} (imported)`}</option>
          )}
          {TEMPLATES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Viewport segmented */}
      <div
        role="radiogroup"
        aria-label="Preview viewport"
        className={cn(
          'hidden items-center gap-0.5 rounded-full p-1 md:flex',
          darkMode ? 'border border-surface-dark-muted bg-surface-dark-raised' : 'border border-stone bg-surface shadow-sm',
        )}
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
              className={viewportPillVariants({ active, dark: darkMode })}
            >
              <span>{label}</span>{' '}
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums',
                  active ? (darkMode ? 'text-ink/60' : 'text-white/60') : darkMode ? 'text-muted' : 'text-muted-dark',
                )}
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
            className={cn(
              'h-7 w-7 rounded-full text-[11px] font-semibold uppercase',
              activeViewport === id
                ? darkMode
                  ? 'bg-white text-ink'
                  : 'bg-ink text-white'
                : darkMode
                  ? 'bg-surface-dark-raised text-muted-dark'
                  : 'bg-surface border border-stone text-muted',
            )}
          >
            {id[0]}
          </button>
        ))}
      </div>

      {/* Scope — Dropdown */}
      <div className="hidden items-center gap-2 text-sm lg:flex">
        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.08em]', darkMode ? 'text-muted-dark' : 'text-muted')}>Scope</span>
        <Dropdown
          open={scopeOpen}
          onOpenChange={setScopeOpen}
          label="Edit scope"
          widthClass="w-48"
          testId="scope-dropdown"
          menuTestId="scope-menu"
          trigger={
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={scopeOpen}
              aria-label="Open scope menu"
              data-testid="scope-trigger"
              onClick={() => setScopeOpen((v) => !v)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-ring focus:border-transparent',
                darkMode
                  ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
                  : 'border-stone bg-surface text-ink hover:border-stone-2 shadow-sm',
              )}
            >
              <span>{scopeOptions.find((o) => o.id === editScope)?.label ?? editScope}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
                className={cn(
                  'shrink-0 transition-transform duration-200',
                  scopeOpen && 'rotate-180',
                  darkMode ? 'text-muted-dark' : 'text-muted',
                )}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
        >
          <div className="flex flex-col gap-0.5 p-1">
            {scopeOptions.map(({ id, label }) => {
              const active = editScope === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  aria-selected={active}
                  data-testid={`scope-option-${id}`}
                  onClick={() => {
                    setEditScope(id as Scope);
                    setScopeOpen(false);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium transition-colors',
                    active
                      ? darkMode
                        ? 'bg-paper text-ink'
                        : 'bg-ink text-white'
                      : darkMode
                        ? 'text-paper hover:bg-white/[0.06]'
                        : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  <span>{label}</span>
                  {active && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', darkMode ? 'bg-ink' : 'bg-white')} />}
                </button>
              );
            })}
          </div>
        </Dropdown>
        <select
          aria-label="Edit scope"
          data-testid="scope-native-select"
          value={editScope}
          onChange={(e) => setEditScope(e.target.value as Scope)}
          className="sr-only"
          tabIndex={-1}
        >
          {scopeOptions.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleShare}
          data-testid="share-button"
          title={roomActive ? 'Leave the shared room' : 'Share this template as a live room'}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]',
            roomActive
              ? 'border-accent bg-accent text-white shadow-[0_4px_12px_rgba(120,104,230,0.3)]'
              : darkMode
                ? 'border-ink-muted bg-surface-dark-raised text-paper hover:border-[#3A3A40] hover:bg-surface-dark-muted'
                : 'border-stone bg-surface text-ink hover:border-stone-2 hover:bg-paper shadow-sm',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              roomActive ? 'animate-pulse bg-white' : 'bg-emerald-500',
            )}
          />
          {roomActive ? 'Sharing' : 'Share'}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo last change"
          title="Undo (Ctrl+Z / Cmd+Z)"
          aria-keyshortcuts="Control+z Meta+z"
          data-testid="undo-button"
          className={cn(
            'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            darkMode
              ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
              : 'border-stone bg-surface text-ink hover:bg-paper',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M5 3L2.5 5.5 5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 5.5h5a3 3 0 0 1 0 6H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo last undone change"
          title="Redo (Ctrl+R / Cmd+R)"
          aria-keyshortcuts="Control+r Meta+r"
          data-testid="redo-button"
          className={cn(
            'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            darkMode
              ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
              : 'border-stone bg-surface text-ink hover:bg-paper',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M9 3l2.5 2.5L9 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 5.5H6a3 3 0 0 0 0 6h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
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
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]',
            isCompareOpen
              ? 'border-accent bg-accent text-white shadow-[0_4px_12px_rgba(120,104,230,0.3)]'
              : darkMode
                ? 'border-ink-muted bg-surface-dark-raised text-paper hover:border-[#3A3A40] hover:bg-surface-dark-muted'
                : 'border-stone bg-surface text-ink hover:border-stone-2 hover:bg-paper shadow-sm',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', isCompareOpen ? 'bg-white' : 'bg-accent')} />
          Compare
        </button>

        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label="Toggle dark mode"
          aria-pressed={darkMode}
          data-testid="dark-mode-toggle"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className={cn(
            'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors',
            darkMode
              ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
              : 'border-stone bg-surface text-ink hover:bg-paper',
          )}
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
            if (isRoomActive()) {
              setToastMessage('Reset is unavailable while sharing a room');
              return;
            }
            if (window.confirm('Reset the template and all history to its original state?')) resetDoc();
          }}
          className={cn(
            'hidden cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors sm:inline-flex',
            darkMode
              ? 'border-[#3A2020] bg-surface-dark-raised text-[#E8A0A0] hover:bg-[#2A1A1A] hover:text-[#FFB4B4]'
              : 'border-[#E8D0D0] bg-surface text-[#A33A2E] hover:border-[#E0B8B8] hover:bg-[#FDF2F2]',
          )}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
