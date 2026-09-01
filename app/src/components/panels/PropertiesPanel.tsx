import { useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import { resolveElement } from '../../engine/resolve';
import type { StylePatch } from '../../types/template';
import { useCommittingDraft } from './useCommittingDraft';

export function PropertiesPanel() {
  const doc = useTemplateStore((s) => s.doc);
  const dispatch = useTemplateStore((s) => s.dispatch);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editScope = useEditorStore((s) => s.editScope);
  const darkMode = useEditorStore((s) => s.darkMode);

  const single = selectedIds.length === 1 ? doc.elements[selectedIds[0]] : undefined;
  const resolved = single ? resolveElement(single, editScope === 'all' ? 'desktop' : editScope) : undefined;

  const setStyle = (patch: StylePatch) => {
    dispatch({
      kind: 'set-style',
      source: 'canvas',
      targetIds: selectedIds,
      scope: editScope,
      baseRevision: doc.revision,
      stylePatch: patch,
    });
  };

  const setContentText = (text: string) => {
    if (!single) return;
    const current = resolveElement(single, 'desktop').content;
    const content =
      single.type === 'button'
        ? { label: text, href: 'href' in current ? current.href : '#' }
        : { text };
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: [single.id],
      scope: editScope,
      baseRevision: doc.revision,
      content,
    });
  };

  const setBrand = (brand: string) => {
    if (!single) return;
    const current = resolveElement(single, 'desktop').content;
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: [single.id],
      scope: editScope,
      baseRevision: doc.revision,
      content: { brand, links: 'links' in current ? current.links : [] },
    });
  };

  const setLinks = (raw: string) => {
    if (!single) return;
    const links = raw
      .split('\n')
      .map((line) => line.split('::'))
      .filter((parts) => parts[0]?.trim())
      .map((parts) => ({ label: parts[0].trim(), href: parts[1]?.trim() ?? '#' }));
    const current = resolveElement(single, 'desktop').content;
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: [single.id],
      scope: editScope,
      baseRevision: doc.revision,
      content: { brand: 'brand' in current ? current.brand : '', links },
    });
  };

  const textSource = single && resolved && 'text' in resolved.content ? resolved.content.text : '';
  const brandSource =
    single && resolved && 'brand' in resolved.content
      ? (resolved.content as { brand: string }).brand
      : '';
  const linksSource =
    single && resolved && 'brand' in resolved.content
      ? (resolved.content as { links: { label: string; href: string }[] }).links
          .map((link) => `${link.label} :: ${link.href}`)
          .join('\n')
      : '';

  const textDraft = useCommittingDraft(textSource, setContentText);
  const brandDraft = useCommittingDraft(brandSource, setBrand);
  const linksDraft = useCommittingDraft(linksSource, setLinks);

  if (selectedIds.length === 0) {
    return (
      <div className={`p-4 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
        Select an element on the canvas or in Layers to edit its properties.
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 p-4 text-sm ${darkMode ? 'text-slate-200' : ''}`}>
      <div>
        <div className={`mb-1 font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-700'}`}>
          {single ? single.id : `${selectedIds.length} elements selected`}
        </div>
        <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Editing scope: {editScope}</div>
      </div>

      {single && resolved && 'text' in resolved.content && (
        <label className="flex flex-col gap-1">
          <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Text{textDraft.isDirty ? ' · press Ctrl+Enter or blur to apply' : ''}
          </span>
          <textarea
            aria-label="Element text"
            rows={2}
            value={textDraft.value}
            onChange={(e) => textDraft.onChange(e.target.value)}
            onBlur={() => textDraft.commit()}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                textDraft.commit();
              }
            }}
            className={`rounded border px-2 py-1 focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          />
        </label>
      )}

      {single && resolved && 'brand' in resolved.content && (
        <label className="flex flex-col gap-1">
          <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Brand</span>
          <input
            aria-label="Brand text"
            value={brandDraft.value}
            onChange={(e) => brandDraft.onChange(e.target.value)}
            onBlur={() => brandDraft.commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                brandDraft.commit();
              }
            }}
            className={`rounded border px-2 py-1 focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          />
        </label>
      )}

      {single && resolved && 'brand' in resolved.content && (
        <label className="flex flex-col gap-1">
          <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Links (one per line: label :: href)</span>
          <textarea
            aria-label="Navigation links"
            rows={3}
            value={linksDraft.value}
            onChange={(e) => linksDraft.onChange(e.target.value)}
            onBlur={() => linksDraft.commit()}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                linksDraft.commit();
              }
            }}
            className={`rounded border px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          />
        </label>
      )}

      <fieldset className={`flex flex-col gap-2 rounded border p-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
        <legend className={`px-1 text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Style</legend>
        <NumberField label="Font size" value={resolved?.style.fontSize} onChange={(v) => setStyle({ fontSize: v })} />
        <NumberField label="Font weight" value={resolved?.style.fontWeight} onChange={(v) => setStyle({ fontWeight: v })} step={100} min={100} max={900} />
        <NumberField label="Line height" value={resolved?.style.lineHeight} onChange={(v) => setStyle({ lineHeight: v })} step={0.1} />
        <ColorField label="Text color" value={resolved?.style.color} onChange={(v) => setStyle({ color: v })} />
        <ColorField label="Background" value={resolved?.style.backgroundColor} onChange={(v) => setStyle({ backgroundColor: v })} />
        <NumberField label="Padding X" value={resolved?.style.paddingX} onChange={(v) => setStyle({ paddingX: v })} />
        <NumberField label="Padding Y" value={resolved?.style.paddingY} onChange={(v) => setStyle({ paddingY: v })} />
        <NumberField label="Margin bottom" value={resolved?.style.marginBottom} onChange={(v) => setStyle({ marginBottom: v })} />
        <NumberField label="Width %" value={resolved?.style.widthPercent} onChange={(v) => setStyle({ widthPercent: v })} min={5} max={100} />
        <NumberField label="Radius" value={resolved?.style.borderRadius} onChange={(v) => setStyle({ borderRadius: v })} />

        <div className="mt-1 flex items-center gap-2">
          <span className={`w-24 shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Align</span>
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              aria-pressed={resolved?.style.textAlign === align}
              onClick={() => setStyle({ textAlign: align })}
              className={`cursor-pointer rounded border px-2 py-1 capitalize ${
                resolved?.style.textAlign === align
                  ? darkMode
                    ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                    : 'border-blue-600 bg-blue-50 text-blue-700'
                  : darkMode
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-300 hover:bg-slate-50'
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </fieldset>

      {selectedIds.length > 1 && (
        <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Style changes apply to all selected elements.</p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const darkMode = useEditorStore((s) => s.darkMode);
  const [draft, setDraft] = useState<string | null>(null);
  const displayed = draft ?? (value !== undefined ? String(value) : '');
  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed === '') return;
    const next = Number(trimmed);
    if (!Number.isNaN(next) && Number.isFinite(next) && next !== value) onChange(next);
  };
  return (
    <label className="flex items-center gap-2">
      <span className={`w-24 shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={displayed}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        className={`min-w-0 flex-1 rounded border px-2 py-1 focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const darkMode = useEditorStore((s) => s.darkMode);
  return (
    <label className="flex items-center gap-2">
      <span className={`w-24 shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 w-14 cursor-pointer rounded border ${darkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'}`}
      />
      <input
        type="text"
        aria-label={`${label} hex`}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) onChange(v);
        }}
        className={`min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
      />
    </label>
  );
}
