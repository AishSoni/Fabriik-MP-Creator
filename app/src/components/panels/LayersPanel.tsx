import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import type { ElementType } from '../../types/template';

export function LayersPanel() {
  const doc = useTemplateStore((s) => s.doc);
  const dispatch = useTemplateStore((s) => s.dispatch);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectOnly = useEditorStore((s) => s.selectOnly);
  const toggleSelect = useEditorStore((s) => s.toggleSelect);
  const root = doc.elements[doc.rootId];

  const move = (id: string, direction: -1 | 1) => {
    const element = doc.elements[id];
    if (!element?.parentId) return;
    const siblings = doc.elements[element.parentId].childIds;
    const current = siblings.indexOf(id);
    const target = current + direction;
    if (target < 0 || target >= siblings.length) return;
    dispatch({
      kind: 'reorder',
      source: 'canvas',
      targetIds: [id],
      scope: 'all',
      baseRevision: doc.revision,
      index: target,
    });
  };

  const removeElement = (id: string) => {
    if (id === doc.rootId) return;
    dispatch({
      kind: 'remove',
      source: 'canvas',
      targetIds: [id],
      scope: 'all',
      baseRevision: doc.revision,
    });
  };

  return (
    <aside aria-label="Layers" className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Layers
      </div>
      <ul className="flex-1 p-1 text-sm">
        {root.childIds.map((sectionId) => (
          <li key={sectionId}>
            <LayerRow
              id={sectionId}
              depth={0}
              selectedIds={selectedIds}
              onSelect={selectOnly}
              onToggle={toggleSelect}
              onMove={move}
              onRemove={removeElement}
            />
            {doc.elements[sectionId]?.childIds.map((childId) => (
              <LayerRow
                key={childId}
                id={childId}
                depth={1}
                selectedIds={selectedIds}
                onSelect={selectOnly}
                onToggle={toggleSelect}
                onMove={move}
                onRemove={removeElement}
              />
            ))}
          </li>
        ))}
      </ul>
    </aside>
  );
}

interface RowProps {
  id: string;
  depth: number;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}

function LayerRow({ id, depth, selectedIds, onSelect, onToggle, onMove, onRemove }: RowProps) {
  const doc = useTemplateStore((s) => s.doc);
  const element = doc.elements[id];
  if (!element) return null;
  const isSelected = selectedIds.includes(id);
  const label = elementLabel(element.id, element.type);

  return (
    <div
      className={`group flex items-center gap-1 rounded px-2 py-1 ${isSelected ? 'bg-blue-100' : 'hover:bg-slate-100'}`}
      style={{ marginLeft: depth * 12 }}
    >
      <button
        type="button"
        onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? onToggle(id) : onSelect(id))}
        className="flex-1 cursor-pointer truncate text-left"
        title={label}
      >
        {label}
      </button>
      <button type="button" aria-label={`Move ${label} up`} onClick={() => onMove(id, -1)} className="invisible cursor-pointer px-1 text-slate-500 hover:text-slate-900 group-hover:visible">
        ↑
      </button>
      <button type="button" aria-label={`Move ${label} down`} onClick={() => onMove(id, 1)} className="invisible cursor-pointer px-1 text-slate-500 hover:text-slate-900 group-hover:visible">
        ↓
      </button>
      <button type="button" aria-label={`Delete ${label}`} onClick={() => onRemove(id)} className="invisible cursor-pointer px-1 text-slate-500 hover:text-red-600 group-hover:visible">
        ✕
      </button>
    </div>
  );
}

function elementLabel(id: string, type: ElementType): string {
  const short = id.replace(/^(hero|feature|cta|footer|testimonial)-/, '');
  return `${short} (${type})`;
}
