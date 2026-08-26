import { useState } from 'react';
import { TopBar } from './TopBar';
import { Canvas } from '../canvas/Canvas';
import { LayersPanel } from '../panels/LayersPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { useEditorStore, type RightPanelTab } from '../../store/editorStore';
import { ErrorToasts } from './ErrorToasts';

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'ai', label: 'AI Demo' },
  { id: 'history', label: 'History' },
  { id: 'code', label: 'Code' },
];

export function EditorShell() {
  const [mobileLayersOpen, setMobileLayersOpen] = useState(true);
  const rightPanelTab = useEditorStore((s) => s.rightPanelTab);
  const setRightPanelTab = useEditorStore((s) => s.setRightPanelTab);

  return (
    <div className="flex h-screen min-w-[1280px] flex-col bg-slate-50">
      <TopBar />
      <ErrorToasts />
      <div className="flex min-h-0 flex-1">
        {mobileLayersOpen && <LayersPanel />}
        <main className="flex min-w-0 flex-1 flex-col" aria-label="Template canvas">
          <Canvas />
        </main>
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
          <div role="tablist" aria-label="Editor panels" className="flex border-b border-slate-200">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={rightPanelTab === id}
                onClick={() => setRightPanelTab(id)}
                className={`flex-1 cursor-pointer px-2 py-2 text-xs font-semibold ${
                  rightPanelTab === id
                    ? 'border-b-2 border-blue-600 text-blue-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
            {rightPanelTab === 'properties' && <PropertiesPanel />}
            {rightPanelTab === 'ai' && (
              <p className="p-4 text-sm text-slate-500">AI demo panel arrives in a later phase.</p>
            )}
            {rightPanelTab === 'history' && (
              <p className="p-4 text-sm text-slate-500">History panel arrives in a later phase.</p>
            )}
            {rightPanelTab === 'code' && (
              <p className="p-4 text-sm text-slate-500">Code surface arrives in a later phase.</p>
            )}
          </div>
        </aside>
      </div>
      <button
        type="button"
        onClick={() => setMobileLayersOpen((v) => !v)}
        className="absolute bottom-3 left-3 cursor-pointer rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
      >
        {mobileLayersOpen ? 'Hide layers' : 'Show layers'}
      </button>
    </div>
  );
}
