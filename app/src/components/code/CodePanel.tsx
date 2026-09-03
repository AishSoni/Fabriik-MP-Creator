import { useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import type { TemplateElement, TemplateDoc } from '../../types/template';

type CodeMode = 'template' | 'element';

export function CodePanel() {
  const doc = useTemplateStore((s) => s.doc);
  const replaceDoc = useTemplateStore((s) => s.replaceDoc);
  const lastErrors = useTemplateStore((s) => s.lastErrors);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const darkMode = useEditorStore((s) => s.darkMode);
  const [mode, setMode] = useState<CodeMode>('template');
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const effectiveMode: CodeMode = mode === 'element' && selectedIds.length === 1 ? 'element' : 'template';

  const currentJson = useMemo(() => {
    if (effectiveMode === 'element' && selectedIds.length === 1) {
      const element = doc.elements[selectedIds[0]];
      return element ? JSON.stringify(element, null, 2) : '';
    }
    return JSON.stringify(doc, null, 2);
  }, [doc, effectiveMode, selectedIds]);

  const displayed = dirty ? text : currentJson;

  const apply = () => {
    setLocalError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(displayed);
    } catch (e) {
      setLocalError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    let candidate: unknown = parsed;
    if (effectiveMode === 'element') {
      const element = parsed as TemplateElement;
      const next: TemplateDoc = JSON.parse(JSON.stringify(doc));
      if (!next.elements[element.id]) {
        setLocalError(`Element "${element.id}" does not exist in the template.`);
        return;
      }
      next.elements[element.id] = element;
      candidate = next;
    }
    const errors = replaceDoc(candidate);
    if (errors.length === 0) {
      setDirty(false);
    }
  };

  return (
    <div className={`flex h-full flex-col ${darkMode ? 'bg-[#141416]' : 'bg-[#FDFBF7]'}`}>
      <div className={`flex flex-wrap items-center gap-2 border-b px-3 py-2.5 ${darkMode ? 'border-white/10 bg-[#1E1E20]' : 'border-[#E7E5E0] bg-white'}`}>
        <div
          role="radiogroup"
          aria-label="Code surface scope"
          className={`inline-flex items-center gap-1 rounded-full border p-1 ${darkMode ? 'border-white/10 bg-[#141416]' : 'border-[#E7E5E0] bg-[#F3EFE8]'}`}
        >
          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === 'template'}
            onClick={() => setMode('template')}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${effectiveMode === 'template' ? (darkMode ? 'bg-[#FDFBF7] text-[#0E0E10] shadow-sm' : 'bg-[#0E0E10] text-white shadow-sm') : darkMode ? 'text-[#9A9996] hover:text-white' : 'text-[#6B6A68] hover:text-[#0E0E10]'}`}
          >
            Whole template
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === 'element'}
            disabled={selectedIds.length !== 1}
            onClick={() => setMode('element')}
            title={selectedIds.length !== 1 ? 'Select exactly one element first' : undefined}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${effectiveMode === 'element' ? (darkMode ? 'bg-[#FDFBF7] text-[#0E0E10] shadow-sm' : 'bg-[#0E0E10] text-white shadow-sm') : darkMode ? 'text-[#9A9996] hover:text-white' : 'text-[#6B6A68] hover:text-[#0E0E10]'}`}
          >
            Selected element
          </button>
        </div>
        <span className={`hidden text-[11px] font-medium tabular-nums sm:inline-flex ${darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}>
          rev {doc.revision} · {Object.keys(doc.elements).length} nodes
        </span>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className={`ml-auto inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed ${dirty ? 'bg-[#7868E6] text-white shadow-[0_8px_24px_rgba(120,104,230,0.28)] hover:bg-[#6354D9]' : darkMode ? 'bg-white/10 text-[#6B6A68]' : 'bg-[#E7E5E0] text-[#9A9996]'}`}
        >
          <span>Apply</span>
          {dirty && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px]">↗</span>}
        </button>
      </div>

      {(localError || lastErrors.length > 0) && (
        <div
          role="alert"
          className={`mx-3 mt-3 rounded-2xl border px-4 py-3 text-xs leading-5 ${darkMode ? 'border-[#E85D4A]/20 bg-[#E85D4A]/10 text-[#FF9B8F]' : 'border-[#E85D4A]/20 bg-[#FFEDEA] text-[#B42318]'}`}
        >
          {localError && <p className="font-mono font-medium">{localError}</p>}
          {lastErrors.slice(0, 3).map((error, i) => (
            <p key={i} className="font-mono">
              <span className="font-bold">{error.code}:</span> {error.message}
            </p>
          ))}
        </div>
      )}

      <div
        className={`m-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border p-1.5 ${darkMode ? 'border-white/10 bg-white/[0.04]' : 'border-[#E7E5E0] bg-[#0E0E10]/[0.04]'}`}
        data-testid="code-editor"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      >
        <div
          className={`flex min-h-0 flex-1 overflow-auto rounded-[14px] border ${darkMode ? 'border-white/10 bg-[#0E0E10]' : 'border-[#E7E5E0] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'}`}
        >
          <CodeMirror
            value={displayed}
            height="100%"
            theme={darkMode ? 'dark' : 'light'}
            extensions={[json()]}
            onChange={(value) => {
              setText(value);
              setDirty(value !== currentJson);
            }}
            basicSetup={{ foldGutter: true }}
            className="flex-1 [&_.cm-editor]:rounded-[14px] [&_.cm-scroller]:rounded-[14px]"
          />
        </div>
      </div>

      <p className={`border-t px-4 py-2.5 text-[11px] leading-5 ${darkMode ? 'border-white/10 bg-[#1E1E20] text-[#6B6A68]' : 'border-[#E7E5E0] bg-white text-[#9A9996]'}`}>
        Edits apply through the same validated command pipeline as the canvas. Invalid code is rejected and the last valid state is preserved. Press <span className="font-medium text-[#7868E6]">Ctrl/Cmd+Enter</span> or click Apply.
      </p>
    </div>
  );
}
