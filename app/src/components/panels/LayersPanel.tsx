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
    const parent = doc.elements[element.parentId];
    if (!parent) return;
    const siblings = parent.childIds;
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
      className={`flex w-[280px] shrink-0 flex-col overflow-hidden border-r min-h-0 ${darkMode ? 'border-[#262629] bg-[#141416]' : 'border-[#E7E5E0] bg-[#FDFBF7]'}`}
    >
      <div className={`shrink-0 flex items-center justify-between border-b px-3.5 py-3 ${darkMode ? 'border-[#262629]' : 'border-[#E7E5E0]'}`}>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-[#9A9996]' : 'text-[#6B6A68]'}`}>Layers</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${darkMode ? 'bg-white/10 text-[#9A9996]' : 'bg-[#0E0E10] text-white'}`}>
          {root.childIds.length} sections
        </span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-2 text-[13px]">
        {root.childIds.map((sectionId) => (
          <LayerBranch key={sectionId} id={sectionId} depth={0} selectedIds={selectedIds} onSelect={selectOnly} onToggle={toggleSelect} onMove={move} onRemove={removeElement} />
        ))}
      </ul>
      <div className={`border-t px-3 py-2 text-[11px] leading-4 ${darkMode ? 'border-[#262629] bg-[#1E1E20] text-[#6B6A68]' : 'border-[#E7E5E0] bg-white text-[#9A9996]'}`}>
        Shift / ⌘ click to multi-select · Hover for actions
      </div>
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
  const darkMode = useEditorStore((s) => s.darkMode);
  const element = doc.elements[props.id];
  if (!element || props.depth > 4) return null;
  return (
    <li className="list-none">
      <LayerRow {...props} />
      {element.childIds.length > 0 && (
        <ul className={`ml-3 mt-1 flex flex-col gap-0.5 border-l pl-2 ${darkMode ? 'border-white/10' : 'border-[#E7E5E0]/60'}`}>
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
        </ul>
      )}
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

function LayerRow({ id, depth, selectedIds, onSelect, onToggle, onMove, onRemove }: RowProps) {
  const doc = useTemplateStore((s) => s.doc);
  const darkMode = useEditorStore((s) => s.darkMode);
  const element = doc.elements[id];
  if (!element) return null;
  const isSelected = selectedIds.includes(id);
  const label = elementLabel(element.id, element.type);

  return (
    <div
      className={`group flex items-center gap-1 rounded-full px-2.5 py-1.5 transition-all duration-150 ${isSelected ? (darkMode ? 'bg-[#FDFBF7] text-[#0E0E10] shadow-sm' : 'bg-[#0E0E10] text-white shadow-sm') : darkMode ? 'text-[#9A9996] hover:bg-white/[0.06] hover:text-[#FDFBF7]' : 'text-[#3A3938] hover:bg-white hover:text-[#0E0E10] hover:shadow-[0_1px_4px_rgba(14,14,16,0.06)]'}`}
      style={{ marginLeft: depth ? 0 : 0 }}
    >
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isSelected ? 'bg-[#7868E6] text-white' : darkMode ? 'bg-white/10 text-[#9A9996]' : 'bg-[#E7E5E0] text-[#6B6A68]'}`}>
        {element.type[0].toUpperCase()}
      </span>
      <button
        type="button"
        onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? onToggle(id) : onSelect(id))}
        className="flex-1 cursor-pointer truncate text-left text-[13px] font-medium"
        title={label}
      >
        {label}
      </button>
      <span className={`hidden rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex ${isSelected ? 'bg-white/15 text-white dark:bg-black/10 dark:text-[#0E0E10]' : darkMode ? 'bg-white/5 text-[#6B6A68]' : 'bg-[#F3EFE8] text-[#9A9996]'}`}>
        {element.type}
      </span>
      <button
        type="button"
        aria-label={`Move ${label} up`}
        onClick={() => onMove(id, -1)}
        className={`invisible inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs group-hover:visible transition-colors ${darkMode ? 'bg-white/5 text-[#9A9996] hover:bg-white/10 hover:text-white' : 'bg-white text-[#6B6A68] hover:bg-[#0E0E10] hover:text-white border border-[#E7E5E0]'}`}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        onClick={() => onMove(id, 1)}
        className={`invisible inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs group-hover:visible transition-colors ${darkMode ? 'bg-white/5 text-[#9A9996] hover:bg-white/10 hover:text-white' : 'bg-white text-[#6B6A68] hover:bg-[#0E0E10] hover:text-white border border-[#E7E5E0]'}`}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`Delete ${label}`}
        onClick={() => onRemove(id)}
        className={`invisible inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-xs group-hover:visible transition-colors ${darkMode ? 'bg-white/5 text-[#9A9996] hover:bg-[#E85D4A] hover:text-white' : 'bg-white text-[#9A9996] hover:bg-[#E85D4A] hover:text-white border border-[#E7E5E0]'}`}
      >
        ✕
      </button>
    </div>
  );
}

function elementLabel(id: string, type: ElementType): string {
  const short = id.replace(/^(hero|feature|cta|footer|testimonial)-/, '');
  return `${short} (${type})`;
}
