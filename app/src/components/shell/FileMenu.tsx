import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import { exportTemplateJson, parseTemplateJson } from '../../engine/exportTemplate';
import { exportHtml } from '../../engine/exportHtml';
import { downloadFile, slugifyFileName } from '../../lib/download';

export const IMPORT_SAVE_FIRST_MESSAGE =
  'Importing will replace your current template and its history. Export your current work as JSON first?';

export function FileMenu() {
  const darkMode = useEditorStore((s) => s.darkMode);
  const setToastMessage = useEditorStore((s) => s.setToastMessage);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const doc = useTemplateStore((s) => s.doc);
  const importDoc = useTemplateStore((s) => s.importDoc);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  const exportCurrentJson = () => {
    const filename = slugifyFileName(doc.templateName, 'json');
    downloadFile(filename, 'application/json', exportTemplateJson(doc));
    return filename;
  };

  const handleExportJson = () => {
    close();
    const filename = exportCurrentJson();
    setToastMessage(`Exported ${filename}`);
  };

  const handleExportHtml = () => {
    close();
    const filename = slugifyFileName(doc.templateName, 'html');
    downloadFile(filename, 'text/html', exportHtml(doc));
    setToastMessage(`Exported ${filename}`);
  };

  const handleImportClick = () => {
    const saveFirst = window.confirm(IMPORT_SAVE_FIRST_MESSAGE);
    if (saveFirst) {
      exportCurrentJson();
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = parseTemplateJson(text);
    if (!parsed.ok) {
      useTemplateStore.setState({ lastErrors: parsed.errors });
      return;
    }
    close();
    const confirmed = window.confirm(
      `Import “${parsed.doc.templateName}”? Your current edits and revision history will be discarded.`,
    );
    if (!confirmed) return;
    const errors = importDoc(parsed.doc);
    if (errors) return;
    clearSelection();
    setToastMessage(`Imported “${parsed.doc.templateName}”`);
  };

  const itemClass = `block w-full cursor-pointer px-3 py-1.5 text-left text-sm ${
    darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'
  }`;

  return (
    <div ref={containerRef} className="relative" data-testid="file-menu">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="file-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        className={`cursor-pointer text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}
      >
        Fabriik
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Template file actions"
          className={`absolute left-0 z-20 mt-2 w-56 rounded-md border py-1 shadow-lg ${
            darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <button
            role="menuitem"
            type="button"
            data-testid="menu-import"
            onClick={handleImportClick}
            className={itemClass}
          >
            Import JSON…
          </button>
          <button
            role="menuitem"
            type="button"
            data-testid="menu-export-json"
            onClick={handleExportJson}
            className={itemClass}
          >
            Export JSON
          </button>
          <button
            role="menuitem"
            type="button"
            data-testid="menu-export-html"
            onClick={handleExportHtml}
            title="Hosted image URLs are preferred so you don't have to manage image files locally."
            className={itemClass}
          >
            Export HTML
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        data-testid="file-menu-input"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
