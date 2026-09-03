import { useRef, useState, type ChangeEvent } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useTemplateStore } from '../../store/templateStore';
import { exportTemplateJson, parseTemplateJson } from '../../engine/exportTemplate';
import { exportHtml } from '../../engine/exportHtml';
import { downloadFile, slugifyFileName } from '../../lib/download';
import { Dropdown } from './Dropdown';

export const IMPORT_SAVE_FIRST_MESSAGE =
  'Importing will replace your current template and its history. Export your current work as JSON first?';

export function FileMenu() {
  const darkMode = useEditorStore((s) => s.darkMode);
  const setToastMessage = useEditorStore((s) => s.setToastMessage);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const doc = useTemplateStore((s) => s.doc);
  const importDoc = useTemplateStore((s) => s.importDoc);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        variant="file"
        widthClass="w-64"
        testId="file-menu"
        label="Template file actions"
        className={darkMode ? 'border-[#262629] bg-[#1E1E20]' : 'border-[#E7E5E0] bg-white'}
        trigger={
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            data-testid="file-menu-trigger"
            onClick={() => setOpen((value) => !value)}
            className={`group cursor-pointer inline-flex items-center gap-2.5 rounded-full border px-2.5 py-1.5 pr-3 text-sm font-semibold transition-colors ${
              darkMode
                ? 'border-[#262629] bg-[#1E1E20] hover:bg-[#262629] text-[#FDFBF7]'
                : 'border-[#E7E5E0] bg-white hover:bg-[#FDFBF7] text-[#0E0E10] shadow-[0_1px_2px_rgba(14,14,16,0.06)]'
            }`}
          >
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold tracking-tight ${darkMode ? 'bg-[#FDFBF7] text-[#0E0E10]' : 'bg-[#0E0E10] text-white'}`}>
              F
            </span>
            <span className="tracking-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em' }}>
              Fabriik
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={`transition-transform duration-200 ${open ? 'rotate-180' : ''} text-[#9A9996]`}
              aria-hidden
            >
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        }
      >
        {/* file variant header — customized for file menu, base variant omits this */}
        <div className={`rounded-[10px] px-3 py-2 ${darkMode ? 'bg-[#141416]' : 'bg-[#FDFBF7]'}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>File</p>
          <p className={`text-xs ${darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}>{doc.templateName}</p>
        </div>
        <div className="mt-1 flex flex-col gap-0.5 p-1">
          <button
            role="menuitem"
            type="button"
            data-testid="menu-import"
            onClick={handleImportClick}
            className={`flex cursor-pointer items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium transition-colors ${
              darkMode ? 'text-[#FDFBF7] hover:bg-white/[0.06]' : 'text-[#0E0E10] hover:bg-[#F3EFE8]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${darkMode ? 'bg-white/10' : 'bg-[#0E0E10] text-white'}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 2.5v6M3.5 6l2.5 2.5L8.5 6M2 9.5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Import JSON…
            </span>
            <span className={`text-[11px] ${darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}>⌘O</span>
          </button>
          <button
            role="menuitem"
            type="button"
            data-testid="menu-export-json"
            onClick={handleExportJson}
            className={`flex cursor-pointer items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium transition-colors ${
              darkMode ? 'text-[#FDFBF7] hover:bg-white/[0.06]' : 'text-[#0E0E10] hover:bg-[#F3EFE8]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${darkMode ? 'bg-white/10' : 'bg-[#E7E5E0]'}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M3 8.5l3-3 3 3M6 5.5v4M2 9.5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Export JSON
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${darkMode ? 'bg-white/10 text-[#9A9996]' : 'bg-[#F3EFE8] text-[#6B6A68]'}`}>JSON</span>
          </button>
          <button
            role="menuitem"
            type="button"
            data-testid="menu-export-html"
            onClick={handleExportHtml}
            title="Hosted image URLs are preferred so you don't have to manage image files locally."
            className={`flex cursor-pointer items-center justify-between rounded-full px-3 py-2 text-left text-sm font-medium transition-colors ${
              darkMode ? 'text-[#FDFBF7] hover:bg-white/[0.06]' : 'text-[#0E0E10] hover:bg-[#F3EFE8]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${darkMode ? 'bg-white/10' : 'bg-[#E7E5E0]'}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2 3l2 3-2 3M6 9.5h4M8 3.5l1 1.5-1 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Export HTML
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${darkMode ? 'bg-[#7868E6]/20 text-[#A99CFF]' : 'bg-[#ECE9FF] text-[#7868E6]'}`}>Static</span>
          </button>
        </div>
        <p className={`px-3 py-2 text-[11px] leading-4 ${darkMode ? 'text-[#6B6A68]' : 'text-[#9A9996]'}`}>
          Imports replace the current doc and history. Exports are deterministic and offline.
        </p>
      </Dropdown>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        data-testid="file-menu-input"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
