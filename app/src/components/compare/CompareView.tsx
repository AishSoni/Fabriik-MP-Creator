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
  if (element.type === 'heading') return <div data-eid={id} style={css}><HeadingView resolved={resolved} style={css} /></div>;
  if (element.type === 'text') return <div data-eid={id} style={css}><TextView resolved={resolved} style={css} /></div>;
  if (element.type === 'button') return <div data-eid={id} style={css}><ButtonView resolved={resolved} style={css} /></div>;
  if (element.type === 'image') return <div data-eid={id}><ImageView resolved={resolved} style={css} /></div>;
  if (element.type === 'list') return <div data-eid={id}><ListView resolved={resolved} style={css} /></div>;
  return null;
}

function StaticCanvas({ doc, viewport }: { doc: TemplateDoc; viewport: 'desktop' | 'tablet' | 'mobile' }) {
  return (
    <div
      className="relative h-fit min-h-full bg-white shadow-xl"
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
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Compare changes" data-testid="compare-modal">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={() => setCompareOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`relative m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-2xl sm:m-4 ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
      >
        <header className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>Compare</h2>
            <p className={`truncate text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Base <span className="font-medium">{baseDoc.templateName}</span> vs Current modifications
              {hasChanges ? ` · ${changedIds.length} element${changedIds.length === 1 ? '' : 's'} changed` : ' · No changes'}
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <span className={`hidden text-xs sm:inline ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} aria-live="polite">
              {hasChanges ? `${changedIds.length} changes` : 'Identical'}
            </span>
            <button
              type="button"
              onClick={() => setCompareOpen(false)}
              aria-label="Close compare"
              data-testid="compare-close"
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-sm font-medium ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <section className={`flex min-h-0 flex-1 flex-col overflow-hidden border-b lg:border-b-0 lg:border-r ${darkMode ? 'border-slate-700' : 'border-slate-200'}`} aria-label="Base template preview">
            <div className={`flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide ${darkMode ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              <span>Base</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-slate-700 dark:text-slate-300">{activeViewport}</span>
            </div>
            <div className={`flex min-h-0 flex-1 justify-center overflow-auto overscroll-contain p-4 ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} data-testid="compare-base-preview">
              <StaticCanvas doc={baseDoc} viewport={activeViewport} />
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Current modification preview">
            <div className={`flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide ${darkMode ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              <span>Current</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${hasChanges ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {hasChanges ? `${changedIds.length} changed` : 'no changes'}
              </span>
            </div>
            <div className={`flex min-h-0 flex-1 justify-center overflow-auto overscroll-contain p-4 ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} data-testid="compare-current-preview">
              <StaticCanvas doc={doc} viewport={activeViewport} />
            </div>
          </section>
        </div>

        <div className={`max-h-40 shrink-0 overflow-y-auto border-t p-3 text-xs ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          {hasChanges ? (
            <div>
              <div className={`mb-1 font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Changed elements</div>
              <ul className="flex flex-wrap gap-1.5" data-testid="compare-changed-list">
                {changedIds.map((id) => (
                  <li
                    key={id}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-slate-50 text-slate-700'}`}
                    title={id}
                  >
                    {id}
                  </li>
                ))}
              </ul>
              <p className={`mt-2 text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Preview shows base template vs current modifications at viewport <span className="font-medium">{activeViewport}</span>. Edit in the main canvas, then reopen Compare to see updates.</p>
            </div>
          ) : (
            <p className={darkMode ? 'text-slate-400' : 'text-slate-500'} data-testid="compare-no-changes">No differences — current matches base template. Make an edit to see changes here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
