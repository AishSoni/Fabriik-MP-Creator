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
    <div className={`flex h-full flex-col ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
      <div className={`flex items-center gap-2 border-b px-3 py-2 text-xs ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
        <div role="radiogroup" aria-label="Code surface scope" className="flex gap-1">
          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === 'template'}
            onClick={() => setMode('template')}
            className={`cursor-pointer rounded px-2 py-1 font-medium ${effectiveMode === 'template' ? (darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700') : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
            className={`cursor-pointer rounded px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${effectiveMode === 'element' ? (darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700') : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Selected element
          </button>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className={`ml-auto cursor-pointer rounded-md px-3 py-1 text-sm font-semibold ${dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-400'}`}
        >
          Apply
        </button>
      </div>

      {(localError || lastErrors.length > 0) && (
        <div role="alert" className={`border-b px-3 py-2 text-xs ${darkMode ? 'border-red-900 bg-red-900/20 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {localError && <p className="font-mono">{localError}</p>}
          {lastErrors.slice(0, 3).map((error, i) => (
            <p key={i} className="font-mono">
              {error.code}: {error.message}
            </p>
          ))}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-auto"
        data-testid="code-editor"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
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
        />
      </div>

      <p className={`border-t px-3 py-1.5 text-[11px] ${darkMode ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
        Edits apply through the same validated command pipeline as the canvas. Invalid code is rejected and the last valid state is preserved. Press Ctrl/Cmd+Enter or click Apply.
      </p>
    </div>
  );
}
