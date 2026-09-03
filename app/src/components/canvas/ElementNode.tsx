import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import { resolveElement } from '../../engine/resolve';
import type { ElementContent, TemplateElement } from '../../types/template';
import { styleToCss } from '../renderer/styleToCss';
import {
  ButtonView,
  HeadingView,
  ImageView,
  ListView,
  NavView,
  TextView,
} from '../renderer/leafViews';

interface ElementNodeProps {
  id: string;
}

export function ElementNode({ id }: ElementNodeProps) {
  const doc = useTemplateStore((s) => s.doc);
  const viewport = useEditorStore((s) => s.activeViewport);
  const editScope = useEditorStore((s) => s.editScope);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectOnly = useEditorStore((s) => s.selectOnly);
  const toggleSelect = useEditorStore((s) => s.toggleSelect);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const dispatch = useTemplateStore((s) => s.dispatch);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');

  const element: TemplateElement | undefined = doc.elements[id];
  if (!element) return null;

  const resolved = resolveElement(element, viewport);
  const css = styleToCss(resolved.style);
  const isSelected = selectedIds.includes(id);
  const editableText = getEditableTextFromResolved(resolved);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelect(id);
    } else {
      selectOnly(id);
    }
  };

  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (editableText !== null) {
      selectOnly(id);
      setDraftText(editableText);
      setEditing(true);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (editing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) toggleSelect(id);
      else selectOnly(id);
      if (e.key === 'Enter' && editableText !== null && isSelected && !e.shiftKey) {
        setDraftText(editableText);
        setEditing(true);
      }
    }
    if (e.key === 'Escape') {
      clearSelection();
    }
  };

  const commitEdit = () => {
    setEditing(false);
    if (editableText === null) return;
    const trimmed = draftText.trim();
    if (!trimmed || trimmed === editableText) return;
    dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: [id],
      scope: editScope,
      baseRevision: doc.revision,
      content: nextContentFor(element, resolved, trimmed),
    });
  };

  const selectionClass = isSelected
    ? 'ring-2 ring-[#7868E6] ring-offset-0 z-10 shadow-[0_0_0_4px_rgba(120,104,230,0.12),0_4px_16px_rgba(120,104,230,0.18)]'
    : 'hover:ring-1 hover:ring-[#0E0E10]/15 hover:shadow-[0_2px_8px_rgba(14,14,16,0.06)]';

  const commonProps = {
    'data-eid': id,
    onClick: handleClick,
    onDoubleClick: editableText !== null ? handleDoubleClick : undefined,
    onKeyDown: handleKeyDown,
    tabIndex: 0,
    role: 'button',
    'aria-selected': isSelected,
    'aria-label': `${element.type}: ${editableText ?? element.id}`,
    className: `relative outline-none transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[#A99CFF] focus-visible:ring-offset-1 rounded-[2px] ${selectionClass}`,
  };

  if (element.type === 'section') {
    return (
      <div {...commonProps} style={css}>
        {isSelected && (
          <span className="pointer-events-none absolute -top-2 -left-2 z-20 inline-flex items-center gap-1 rounded-full bg-[#0E0E10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white shadow-md">
            <span className="h-1 w-1 rounded-full bg-[#7868E6]" />
            {id}
          </span>
        )}
        {element.childIds.map((childId) => (
          <ElementNode key={childId} id={childId} />
        ))}
      </div>
    );
  }

  if (element.type === 'nav') {
    return (
      <nav {...commonProps}>
        {isSelected && (
          <span className="pointer-events-none absolute -top-2 left-2 z-20 inline-flex rounded-full bg-[#0E0E10] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">NAV · {id}</span>
        )}
        <NavView resolved={resolved} style={css} />
      </nav>
    );
  }

  if (editing && editableText !== null) {
    return (
      <div {...commonProps} style={css}>
        <input
          autoFocus
          value={draftText}
          aria-label={`Edit ${element.type} text`}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onKeyUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-full rounded-full border border-[#7868E6] bg-white px-3 py-2 text-sm font-medium text-[#0E0E10] shadow-[0_4px_16px_rgba(120,104,230,0.2)] focus:outline-none focus:ring-2 focus:ring-[#A99CFF]"
        />
      </div>
    );
  }

  const withBadge = (children: React.ReactNode) => (
    <div {...commonProps}>
      {isSelected && (
        <span className="pointer-events-none absolute -top-2 left-2 z-20 inline-flex rounded-full bg-[#7868E6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
          {element.type}
        </span>
      )}
      {children}
    </div>
  );

  switch (element.type) {
    case 'heading':
      return withBadge(<HeadingView resolved={resolved} style={css} />);
    case 'text':
      return withBadge(<TextView resolved={resolved} style={css} />);
    case 'button':
      return withBadge(<ButtonView resolved={resolved} style={css} />);
    case 'image':
      return withBadge(<ImageView resolved={resolved} style={css} />);
    case 'list':
      return withBadge(<ListView resolved={resolved} style={css} />);
    default:
      return null;
  }
}

function getEditableTextFromResolved(resolved: import('../../engine/resolve').ResolvedElement): string | null {
  const content = resolved.content as Record<string, unknown>;
  if ('text' in content && typeof content.text === 'string') return content.text as string;
  if ('label' in content && typeof content.label === 'string') return content.label as string;
  return null;
}

function nextContentFor(
  element: TemplateElement,
  resolved: import('../../engine/resolve').ResolvedElement,
  text: string,
): ElementContent {
  switch (element.type) {
    case 'heading':
    case 'text':
      return { text };
    case 'button': {
      const href = (resolved.content as { href: string }).href ?? '#';
      return { label: text, href };
    }
    default:
      return { text };
  }
}
