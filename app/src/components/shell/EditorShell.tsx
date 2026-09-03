import { useState } from 'react';
import { TopBar } from './TopBar';
import { Canvas } from '../canvas/Canvas';
import { LayersPanel } from '../panels/LayersPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { useEditorStore, type RightPanelTab } from '../../store/editorStore';
import { CodePanel } from '../code/CodePanel';
import { HistoryPanel } from '../panels/HistoryPanel';
import { AiDemoPanel } from '../panels/AiDemoPanel';
import { ErrorToasts } from './ErrorToasts';
import { Toast } from './Toast';
import { CompareView } from '../compare/CompareView';

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'ai', label: 'AI Demo' },
  { id: 'history', label: 'History' },
  { id: 'code', label: 'Code' },
];

export function EditorShell() {
  const [layersOpen, setLayersOpen] = useState(true);
  const rightPanelTab = useEditorStore((s) => s.rightPanelTab);
  const setRightPanelTab = useEditorStore((s) => s.setRightPanelTab);
  const selectionKey = useEditorStore((s) => s.selectedIds.join('|'));
  const darkMode = useEditorStore((s) => s.darkMode);

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden antialiased selection:bg-[var(--color-accent-soft)] ${
        darkMode ? 'bg-[#0E0E10] text-[#FDFBF7]' : 'bg-[#FDFBF7] text-[#0E0E10]'
      }`}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <TopBar />
      <ErrorToasts />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {layersOpen && <LayersPanel />}
        <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden" aria-label="Template canvas">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Canvas />
          </div>
          <div
            className={`shrink-0 overflow-hidden border-t transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              darkMode ? 'border-[#262629] bg-[#141416]' : 'border-[#E7E5E0] bg-white'
            }`}
            style={{ height: rightPanelTab === 'code' ? '42vh' : 0 }}
            data-testid="code-drawer"
            hidden={rightPanelTab !== 'code'}
          >
            <CodePanel />
          </div>
        </main>
        <aside
          className={`flex w-[348px] shrink-0 flex-col overflow-hidden border-l min-h-0 ${
            darkMode ? 'border-[#262629] bg-[#141416]' : 'border-[#E7E5E0] bg-white'
          }`}
          style={{ boxShadow: darkMode ? 'none' : 'var(--shadow-panel)' }}
        >
          <div
            role="tablist"
            aria-label="Editor panels"
            className={`flex shrink-0 items-center gap-1 border-b p-1.5 ${
              darkMode ? 'border-[#262629] bg-[#1E1E20]' : 'border-[#E7E5E0] bg-[#F3EFE8]'
            }`}
          >
            {TABS.map(({ id, label }) => {
              const active = rightPanelTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRightPanelTab(id)}
                  className={`flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-wide transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    active
                      ? darkMode
                        ? 'bg-[#FDFBF7] text-[#0E0E10] shadow-[0_2px_8px_rgba(14,14,16,0.12)]'
                        : 'bg-[#0E0E10] text-white shadow-[0_2px_8px_rgba(14,14,16,0.12)]'
                      : darkMode
                        ? 'text-[#9A9996] hover:text-[#FDFBF7] hover:bg-white/[0.06]'
                        : 'text-[#6B6A68] hover:text-[#0E0E10] hover:bg-[#0E0E10]/[0.06]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div
            role="tabpanel"
            className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${
              darkMode ? 'bg-[#141416]' : 'bg-white'
            }`}
          >
            {rightPanelTab === 'properties' && <PropertiesPanel key={selectionKey} />}
            {rightPanelTab === 'ai' && <AiDemoPanel />}
            {rightPanelTab === 'history' && <HistoryPanel />}
            {rightPanelTab === 'code' && (
              <div className="p-5">
                <div
                  className={`rounded-[14px] border px-4 py-3 text-sm leading-relaxed ${
                    darkMode ? 'border-[#262629] bg-[#1E1E20] text-[#9A9996]' : 'border-[#E7E5E0] bg-[#FDFBF7] text-[#6B6A68]'
                  }`}
                >
                  <p className="font-medium text-[13px] tracking-wide" style={{ fontFamily: 'var(--font-sans)' }}>
                    Code surface active
                  </p>
                  <p className="mt-1 text-[12.5px] leading-5 opacity-80">
                    The JSON editor is open below the canvas. Select a single element to scope the editor to it, or edit the whole template.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      <button
        type="button"
        onClick={() => setLayersOpen((v) => !v)}
        className={`absolute bottom-4 left-4 z-10 cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-[0_8px_24px_rgba(14,14,16,0.14),0_2px_8px_rgba(14,14,16,0.08)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
          darkMode
            ? 'bg-[#FDFBF7] text-[#0E0E10] hover:bg-white'
            : 'bg-[#0E0E10] text-white hover:bg-[#1A1A1E]'
        }`}
      >
        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none ${darkMode ? 'bg-black/10' : 'bg-white/15'}`}>
          {layersOpen ? '−' : '+'}
        </span>
        {layersOpen ? 'Hide layers' : 'Show layers'}
      </button>
      <CompareView />
      <Toast />
    </div>
  );
}
