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
      <div className={`p-6 ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>
        <div
          className={`rounded-[20px] border border-dashed p-6 text-center ${darkMode ? 'border-white/10 bg-white/[0.04]' : 'border-[#E7E5E0] bg-white'}`}
        >
          <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>No selection</p>
          <p className="mt-2 text-sm leading-6">
            Select an element on the canvas or in Layers to edit its properties.
          </p>
          <p className="mt-1 text-xs opacity-60">Tune type, color, spacing and alignment per breakpoint.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-5 p-4 text-sm animate-in ${darkMode ? 'text-[#E7E5E0]' : 'text-[#0E0E10]'}`}>
      <div className={`shell-outer rounded-[20px] ${darkMode ? 'bg-white/[0.04] border-white/10' : 'bg-[#0E0E10]/[0.04] border-[#0E0E10]/[0.06]'}`}>
        <div className={`shell-inner rounded-[16px] flex items-start justify-between gap-3 p-3.5 ${darkMode ? 'bg-[#1E1E20]' : 'bg-white'}`}>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>
              {single ? single.type : 'Multiple selection'}
            </p>
            <p className="mt-1 truncate font-mono text-[13px] font-semibold leading-none tracking-tight">
              {single ? single.id : `${selectedIds.length} elements selected`}
            </p>
            {single && resolved && (
              <p className={`mt-1.5 truncate text-xs ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>
                In <span className="font-medium text-[#7868E6]">{doc.elements[single.parentId ?? '']?.id ?? 'root'}</span> · depth handled automatically
              </p>
            )}
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize tabular-nums ${darkMode ? 'bg-[#FDFBF7] text-[#0E0E10]' : 'bg-[#0E0E10] text-white'}`}
          >
            {editScope === 'all' ? 'All breakpoints' : editScope}
          </span>
        </div>
      </div>

      {single && resolved && 'text' in resolved.content && (
        <label className="flex flex-col gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>
            Text{ textDraft.isDirty ? <span className="ml-2 rounded-full bg-[#7868E6] px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white">● press Ctrl+Enter or blur to apply</span> : null }
          </span>
          <textarea
            aria-label="Element text"
            rows={3}
            value={textDraft.value}
            onChange={(e) => textDraft.onChange(e.target.value)}
            onBlur={() => textDraft.commit()}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                textDraft.commit();
              }
            }}
            placeholder="Write something honest."
            className={`min-h-[84px] rounded-2xl border px-3.5 py-3 text-[14px] leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors duration-200 placeholder:text-[#9A9996] focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${darkMode ? 'border-white/10 bg-[#141416] text-[#FDFBF7] focus:border-[#7868E6]' : 'border-[#E7E5E0] bg-white text-[#0E0E10] focus:border-[#7868E6]'}`}
          />
        </label>
      )}

      {single && resolved && 'brand' in resolved.content && (
        <label className="flex flex-col gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Brand</span>
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
            placeholder="Fabriik"
            className={`rounded-full border px-4 py-2.5 text-[14px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-colors duration-200 placeholder:text-[#9A9996] focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${darkMode ? 'border-white/10 bg-[#141416] text-[#FDFBF7] focus:border-[#7868E6]' : 'border-[#E7E5E0] bg-white text-[#0E0E10] focus:border-[#7868E6]'}`}
          />
        </label>
      )}

      {single && resolved && 'brand' in resolved.content && (
        <label className="flex flex-col gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Links — one per line · label :: href</span>
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
            placeholder="Journal :: /journal"
            className={`rounded-2xl border px-3.5 py-3 font-mono text-xs leading-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors duration-200 placeholder:text-[#9A9996] focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${darkMode ? 'border-white/10 bg-[#141416] text-[#FDFBF7] focus:border-[#7868E6]' : 'border-[#E7E5E0] bg-white text-[#0E0E10] focus:border-[#7868E6]'}`}
          />
        </label>
      )}

      <fieldset
        className={`flex flex-col gap-3 rounded-[20px] border p-4 ${darkMode ? 'border-white/10 bg-[#1E1E20]' : 'border-[#E7E5E0] bg-white shadow-[0_1px_2px_rgba(22,22,24,0.06),0_12px_32px_rgba(22,22,24,0.06)]'}`}
      >
        <legend className={`px-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Style</legend>
        <div className="grid gap-3">
          <NumberField label="Font size" value={resolved?.style.fontSize} onChange={(v) => setStyle({ fontSize: v })} />
          <NumberField label="Weight" value={resolved?.style.fontWeight} onChange={(v) => setStyle({ fontWeight: v })} step={100} min={100} max={900} />
          <NumberField label="Line height" value={resolved?.style.lineHeight} onChange={(v) => setStyle({ lineHeight: v })} step={0.1} />
          <ColorField label="Text" value={resolved?.style.color} onChange={(v) => setStyle({ color: v })} />
          <ColorField label="Background" value={resolved?.style.backgroundColor} onChange={(v) => setStyle({ backgroundColor: v })} />
          <NumberField label="Padding X" value={resolved?.style.paddingX} onChange={(v) => setStyle({ paddingX: v })} />
          <NumberField label="Padding Y" value={resolved?.style.paddingY} onChange={(v) => setStyle({ paddingY: v })} />
          <NumberField label="Margin btm" value={resolved?.style.marginBottom} onChange={(v) => setStyle({ marginBottom: v })} />
          <NumberField label="Width %" value={resolved?.style.widthPercent} onChange={(v) => setStyle({ widthPercent: v })} min={5} max={100} />
          <NumberField label="Radius" value={resolved?.style.borderRadius} onChange={(v) => setStyle({ borderRadius: v })} />
        </div>

        <div className={`mt-1 flex items-center gap-2 rounded-full p-1 ${darkMode ? 'bg-[#141416] border border-white/10' : 'bg-[#F3EFE8] border border-[#E7E5E0]'}`}>
          <span className={`ml-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Align</span>
          <div className="ml-auto flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                aria-pressed={resolved?.style.textAlign === align}
                onClick={() => setStyle({ textAlign: align })}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-200 active:scale-[0.98] ${
                  resolved?.style.textAlign === align
                    ? 'bg-[#0E0E10] text-white shadow-sm dark:bg-[#FDFBF7] dark:text-[#0E0E10]'
                    : darkMode
                      ? 'text-[#9A9996] hover:bg-white/10 hover:text-white'
                      : 'text-[#6B6A68] hover:bg-white hover:text-[#0E0E10]'
                }`}
              >
                {align}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {selectedIds.length > 1 && (
        <p className={`rounded-full px-3 py-2 text-center text-xs ${darkMode ? 'bg-[#7868E6]/15 text-[#A99CFF] border border-[#7868E6]/20' : 'bg-[#ECE9FF] text-[#6354D9] border border-[#7868E6]/15'}`}>
          Style changes apply to all selected elements.
        </p>
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
    <label className="flex items-center gap-3">
      <span className={`w-[88px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>{label}</span>
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
        placeholder="—"
        className={`min-w-0 flex-1 rounded-full border px-3.5 py-2 text-sm font-medium tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors duration-200 placeholder:text-[#9A9996] focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${darkMode ? 'border-white/10 bg-[#141416] text-[#FDFBF7] focus:border-[#7868E6]' : 'border-[#E7E5E0] bg-[#FDFBF7] text-[#0E0E10] focus:border-[#7868E6] focus:bg-white'}`}
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
    <label className="flex items-center gap-3">
      <span className={`w-[88px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#0E0E10'}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-14 cursor-pointer rounded-full border p-1 shadow-sm ${darkMode ? 'border-white/10 bg-[#141416]' : 'border-[#E7E5E0] bg-white'}`}
      />
      <input
        type="text"
        aria-label={`${label} hex`}
        value={value ?? ''}
        placeholder="#0E0E10"
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) onChange(v);
        }}
        className={`min-w-0 flex-1 rounded-full border px-3.5 py-2 font-mono text-xs font-medium tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors duration-200 placeholder:text-[#9A9996] focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${darkMode ? 'border-white/10 bg-[#141416] text-[#FDFBF7] focus:border-[#7868E6]' : 'border-[#E7E5E0] bg-[#FDFBF7] text-[#0E0E10] focus:border-[#7868E6] focus:bg-white'}`}
      />
    </label>
  );
}
