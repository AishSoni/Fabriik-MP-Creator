import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import type { ElementType } from '../../types/template';

export function LayersPanel() {
  const doc = useTemplateStore((s) => s.doc);
  const dispatch = useTemplateStore((s) => s.dispatch);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectOnly = useEditorStore((s) => s.selectOnly);
  const toggleSelect = useEditorStore((s) => s.toggleSelect);
  const darkMode = useEditorStore((s) => s.darkMode);
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
    <aside
      aria-label="Layers"
      className={`flex w-56 shrink-0 flex-col overflow-hidden border-r min-h-0 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}
    >
      <div
        className={`shrink-0 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}
      >
        Layers
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-1 text-sm">
        {root.childIds.map((sectionId) => (
          <LayerBranch key={sectionId} id={sectionId} depth={0} selectedIds={selectedIds} onSelect={selectOnly} onToggle={toggleSelect} onMove={move} onRemove={removeElement} />
        ))}
      </ul>
    </aside>
  );
}

interface BranchProps {
  id: string;
  depth: number;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}

function LayerBranch(props: BranchProps) {
  const doc = useTemplateStore((s) => s.doc);
  const element = doc.elements[props.id];
  if (!element || props.depth > 4) return null;
  return (
    <li>
      <LayerRow {...props} />
      {element.childIds.map((childId) => (
        <LayerBranch
          key={childId}
          id={childId}
          depth={props.depth + 1}
          selectedIds={props.selectedIds}
          onSelect={props.onSelect}
          onToggle={props.onToggle}
          onMove={props.onMove}
          onRemove={props.onRemove}
        />
      ))}
    </li>
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

function LayerRow({ id, depth, selectedIds, onSelect, onToggle, onMove, onRemove }: RowProps) {  const doc = useTemplateStore((s) => s.doc);
  const darkMode = useEditorStore((s) => s.darkMode);
  const element = doc.elements[id];
  if (!element) return null;
  const isSelected = selectedIds.includes(id);
  const label = elementLabel(element.id, element.type);

  return (
    <div
      className={`group flex items-center gap-1 rounded px-2 py-1 ${isSelected ? (darkMode ? 'bg-blue-900/40 text-blue-200' : 'bg-blue-100') : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100'}`}
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
      <button type="button" aria-label={`Move ${label} up`} onClick={() => onMove(id, -1)} className={`invisible cursor-pointer px-1 group-hover:visible ${darkMode ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'}`}>
        ↑
      </button>
      <button type="button" aria-label={`Move ${label} down`} onClick={() => onMove(id, 1)} className={`invisible cursor-pointer px-1 group-hover:visible ${darkMode ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'}`}>
        ↓
      </button>
      <button type="button" aria-label={`Delete ${label}`} onClick={() => onRemove(id)} className={`invisible cursor-pointer px-1 group-hover:visible ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-500 hover:text-red-600'}`}>
        ✕
      </button>
    </div>
  );
}

function elementLabel(id: string, type: ElementType): string {
  const short = id.replace(/^(hero|feature|cta|footer|testimonial)-/, '');
  return `${short} (${type})`;
}
