import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import { getTemplateById } from '../../template';
import { resolveElement } from '../../engine/resolve';
import { VIEWPORT_WIDTH } from '../../types/viewport';
import type { TemplateDoc } from '../../types/template';
import { styleToCss } from '../renderer/styleToCss';
import { ButtonView, HeadingView, ImageView, ListView, NavView, TextView } from '../renderer/leafViews';

function StaticElement({ doc, id, viewport }: { doc: TemplateDoc; id: string; viewport: 'desktop' | 'tablet' | 'mobile' }) {
  const element = doc.elements[id];
  if (!element) return null;
  const resolved = resolveElement(element, viewport);
  const css = styleToCss(resolved.style);

  if (element.type === 'section') {
    return (
      <div style={css} data-eid={id}>
        {element.childIds.map((childId) => (
          <StaticElement key={childId} doc={doc} id={childId} viewport={viewport} />
        ))}
      </div>
    );
  }
  if (element.type === 'nav') return <nav data-eid={id}><NavView resolved={resolved} style={css} /></nav>;
  if (element.type === 'heading') return <div data-eid={id}><HeadingView resolved={resolved} style={css} /></div>;
  if (element.type === 'text') return <div data-eid={id}><TextView resolved={resolved} style={css} /></div>;
  if (element.type === 'button') return <div data-eid={id}><ButtonView resolved={resolved} style={css} /></div>;
  if (element.type === 'image') return <div data-eid={id}><ImageView resolved={resolved} style={css} /></div>;
  if (element.type === 'list') return <div data-eid={id}><ListView resolved={resolved} style={css} /></div>;
  return null;
}

function StaticCanvas({ doc, viewport }: { doc: TemplateDoc; viewport: 'desktop' | 'tablet' | 'mobile' }) {
  return (
    <div
      className="relative h-fit min-h-full overflow-hidden rounded-[16px] bg-white shadow-[0_8px_32px_rgba(14,14,16,0.12)] ring-1 ring-[#E7E5E0]"
      style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: '100%' }}
    >
      <StaticElement doc={doc} id={doc.rootId} viewport={viewport} />
    </div>
  );
}

export function getChangedIds(base: TemplateDoc, current: TemplateDoc): string[] {
  const ids = new Set<string>([...Object.keys(base.elements), ...Object.keys(current.elements)]);
  const changed: string[] = [];
  for (const id of ids) {
    const b = base.elements[id];
    const c = current.elements[id];
    if (!b || !c) {
      changed.push(id);
      continue;
    }
    if (JSON.stringify(b.content) !== JSON.stringify(c.content) || JSON.stringify(b.style) !== JSON.stringify(c.style) || JSON.stringify(b.childIds) !== JSON.stringify(c.childIds)) {
      changed.push(id);
    }
  }
  return changed;
}

export function CompareView() {
  const isCompareOpen = useEditorStore((s) => s.isCompareOpen);
  const setCompareOpen = useEditorStore((s) => s.setCompareOpen);
  const activeViewport = useEditorStore((s) => s.activeViewport);
  const darkMode = useEditorStore((s) => s.darkMode);
  const doc = useTemplateStore((s) => s.doc);
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId);

  if (!isCompareOpen) return null;

  const baseDoc = getTemplateById(activeTemplateId)?.create() ?? doc;
  const changedIds = getChangedIds(baseDoc, doc);
  const hasChanges = changedIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col p-2 sm:p-5" role="dialog" aria-modal="true" aria-label="Compare changes" data-testid="compare-modal">
      <div
        className="absolute inset-0 bg-[#0E0E10]/55 backdrop-blur-[6px]"
        onClick={() => setCompareOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border p-1.5 shadow-[0_16px_64px_rgba(14,14,16,0.24)] sm:p-2 ${darkMode ? 'border-white/10 bg-white/[0.06]' : 'border-[#0E0E10]/[0.08] bg-[#0E0E10]/[0.06]'}`}
      >
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border ${darkMode ? 'border-white/10 bg-[#141416]' : 'border-[#E7E5E0] bg-[#FDFBF7] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(14,14,16,0.06)]'}`}
        >
          <header className={`flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6 ${darkMode ? 'border-white/10 bg-[#1E1E20]' : 'border-[#E7E5E0] bg-white'}`}>
            <div className="min-w-0">
              <h2 className="text-display text-[22px] font-semibold tracking-tight sm:text-[26px]" style={{ fontFamily: 'var(--font-display)' }}>
                Compare
              </h2>
              <p className={`mt-1.5 flex flex-wrap items-center gap-2 text-xs leading-5 ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${darkMode ? 'border-white/10 bg-white/5 text-[#9A9996]' : 'border-[#E7E5E0] bg-[#FDFBF7] text-[#3A3938]'}`}>
                  Base <span className="font-semibold text-[#0E0E10] dark:text-white">{baseDoc.templateName}</span>
                </span>
                <span className="hidden sm:inline opacity-40">→</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${hasChanges ? 'bg-[#ECE9FF] text-[#6354D9] dark:bg-[#7868E6]/20 dark:text-[#A99CFF]' : 'bg-[#E7E5E0] text-[#6B6A68] dark:bg-white/10 dark:text-[#9A9996]'}`}>
                  {hasChanges ? `${changedIds.length} changed` : 'No changes'}
                </span>
                <span className="hidden text-[11px] tabular-nums sm:inline opacity-60">at {activeViewport}</span>
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className={`hidden rounded-full px-3 py-1 text-xs font-medium tabular-nums sm:inline-flex ${darkMode ? 'bg-white/5 text-[#9A9996] border border-white/10' : 'bg-[#F3EFE8] text-[#6B6A68] border border-[#E7E5E0]'}`} aria-live="polite">
                {hasChanges ? `${changedIds.length} changes` : 'Identical'}
              </span>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                aria-label="Close compare"
                data-testid="compare-close"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${darkMode ? 'bg-[#FDFBF7] text-[#0E0E10] hover:bg-white' : 'bg-[#0E0E10] text-white hover:bg-[#1A1A1E] shadow-sm'}`}
              >
                Close <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] dark:bg-black/10">✕</span>
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <section className={`flex min-h-0 flex-1 flex-col overflow-hidden border-b lg:border-b-0 lg:border-r ${darkMode ? 'border-white/10' : 'border-[#E7E5E0]'}`} aria-label="Base template preview">
              <div className={`flex shrink-0 items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'bg-[#141416] text-[#9A9996] border-b border-white/10' : 'bg-[#F3EFE8] text-[#6B6A68] border-b border-[#E7E5E0]'}`}>
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#9A9996]" /> Base</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${darkMode ? 'bg-white/10 text-[#E7E5E0]' : 'bg-[#0E0E10] text-white'}`}>{activeViewport}</span>
              </div>
              <div className={`flex min-h-0 flex-1 justify-center overflow-auto overscroll-contain p-6 ${darkMode ? 'canvas-grid-dark' : 'canvas-grid'}`} data-testid="compare-base-preview">
                <StaticCanvas doc={baseDoc} viewport={activeViewport} />
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Current modification preview">
              <div className={`flex shrink-0 items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'bg-[#141416] text-[#9A9996] border-b border-white/10' : 'bg-[#F3EFE8] text-[#6B6A68] border-b border-[#E7E5E0]'}`}>
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#7868E6]" /> Current</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${hasChanges ? 'bg-[#7868E6] text-white' : 'bg-[#E7E5E0] text-[#6B6A68] dark:bg-white/10 dark:text-[#9A9996]'}`}>
                  {hasChanges ? `${changedIds.length} changed` : 'no changes'}
                </span>
              </div>
              <div className={`flex min-h-0 flex-1 justify-center overflow-auto overscroll-contain p-6 ${darkMode ? 'canvas-grid-dark' : 'canvas-grid'}`} data-testid="compare-current-preview">
                <StaticCanvas doc={doc} viewport={activeViewport} />
              </div>
            </section>
          </div>

          <div className={`max-h-44 shrink-0 overflow-y-auto border-t p-4 text-xs ${darkMode ? 'border-white/10 bg-[#1E1E20]' : 'border-[#E7E5E0] bg-white'}`}>
            {hasChanges ? (
              <div>
                <div className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Changed elements</div>
                <ul className="flex flex-wrap gap-1.5" data-testid="compare-changed-list">
                  {changedIds.map((id) => (
                    <li
                      key={id}
                      className={`rounded-full border px-3 py-1.5 font-mono text-[11px] font-medium ${darkMode ? 'border-white/10 bg-[#141416] text-[#E7E5E0]' : 'border-[#E7E5E0] bg-[#FDFBF7] text-[#0E0E10] shadow-sm'}`}
                      title={id}
                    >
                      {id}
                    </li>
                  ))}
                </ul>
                <p className={`mt-3 text-[11px] leading-5 ${darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}>
                  Preview shows base template vs current modifications at viewport <span className="font-semibold text-[#7868E6]">{activeViewport}</span>. Edit in the main canvas, then reopen Compare to see updates.
                </p>
              </div>
            ) : (
              <p className={`rounded-2xl border border-dashed px-4 py-3 text-center text-sm leading-6 ${darkMode ? 'border-white/10 bg-white/[0.04] text-[#9A9996]' : 'border-[#E7E5E0] bg-[#FDFBF7] text-[#6B6A68]'}`} data-testid="compare-no-changes">
                No differences — current matches base template. Make an edit to see changes here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
