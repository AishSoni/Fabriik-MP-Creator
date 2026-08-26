import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import { resolveElement } from '../../engine/resolve';
import type { StylePatch } from '../../types/template';

export function PropertiesPanel() {
  const doc = useTemplateStore((s) => s.doc);
  const dispatch = useTemplateStore((s) => s.dispatch);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editScope = useEditorStore((s) => s.editScope);

  if (selectedIds.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Select an element on the canvas or in Layers to edit its properties.
      </div>
    );
  }

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

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div>
        <div className="mb-1 font-semibold text-slate-700">
          {single ? single.id : `${selectedIds.length} elements selected`}
        </div>
        <div className="text-xs text-slate-500">Editing scope: {editScope}</div>
      </div>

      {single && resolved && 'text' in resolved.content && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-600">Text</span>
          <textarea
            aria-label="Element text"
            rows={2}
            value={resolved.content.text}
            onChange={(e) => setContentText(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
          />
        </label>
      )}

      {single && resolved && 'brand' in resolved.content && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-600">Brand</span>
          <input
            aria-label="Brand text"
            value={resolved.content.brand}
            onChange={(e) => {
              const current = resolveElement(single, 'desktop').content;
              dispatch({
                kind: 'set-content',
                source: 'canvas',
                targetIds: [single.id],
                scope: editScope,
                baseRevision: doc.revision,
                content: {
                  brand: e.target.value,
                  links: 'links' in current ? current.links : [],
                },
              });
            }}
            className="rounded border border-slate-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
          />
        </label>
      )}

      <fieldset className="flex flex-col gap-2 rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Style</legend>
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
          <span className="w-24 shrink-0 text-slate-600">Align</span>
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              aria-pressed={resolved?.style.textAlign === align}
              onClick={() => setStyle({ textAlign: align })}
              className={`cursor-pointer rounded border px-2 py-1 capitalize ${
                resolved?.style.textAlign === align
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-300 hover:bg-slate-50'
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </fieldset>

      {selectedIds.length > 1 && (
        <p className="text-xs text-slate-500">Style changes apply to all selected elements.</p>
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
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-slate-600">{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value ?? ''}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
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
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-slate-600">{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-14 cursor-pointer rounded border border-slate-300"
      />
      <input
        type="text"
        aria-label={`${label} hex`}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{3,8}$/.test(v)) onChange(v);
        }}
        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}
