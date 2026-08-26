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
  const editableText = getEditableText(element);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelect(id);
    } else {
      selectOnly(id);
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
      scope: useEditorStore.getState().editScope,
      baseRevision: doc.revision,
      content: nextContentFor(element, trimmed),
    });
  };

  const commonProps = {
    'data-eid': id,
    onClick: handleClick,
    onKeyDown: handleKeyDown,
    tabIndex: 0,
    role: 'button',
    'aria-selected': isSelected,
    'aria-label': `${element.type}: ${editableText ?? element.id}`,
    className: `relative outline-none transition-[outline] focus-visible:ring-2 focus-visible:ring-blue-500 ${
      isSelected ? 'ring-2 ring-offset-0 ring-blue-600 z-10' : 'hover:ring-1 hover:ring-blue-300'
    }`,
  };

  if (element.type === 'section') {
    return (
      <div {...commonProps} style={css}>
        {element.childIds.map((childId) => (
          <ElementNode key={childId} id={childId} />
        ))}
      </div>
    );
  }

  if (element.type === 'nav') {
    return (
      <nav {...commonProps}>
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
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full rounded border border-blue-500 px-2 py-1 text-slate-900"
        />
      </div>
    );
  }

  switch (element.type) {
    case 'heading':
      return (
        <div
          {...commonProps}
          onDoubleClick={() => {
            if (editableText !== null) {
              setDraftText(editableText);
              setEditing(true);
            }
          }}
        >
          <HeadingView resolved={resolved} style={css} />
        </div>
      );
    case 'text':
      return (
        <div
          {...commonProps}
          onDoubleClick={() => {
            if (editableText !== null) {
              setDraftText(editableText);
              setEditing(true);
            }
          }}
        >
          <TextView resolved={resolved} style={css} />
        </div>
      );
    case 'button':
      return (
        <div
          {...commonProps}
          onDoubleClick={() => {
            if (editableText !== null) {
              setDraftText(editableText);
              setEditing(true);
            }
          }}
        >
          <ButtonView resolved={resolved} style={css} />
        </div>
      );
    case 'image':
      return (
        <div {...commonProps}>
          <ImageView resolved={resolved} style={css} />
        </div>
      );
    case 'list':
      return (
        <div {...commonProps}>
          <ListView resolved={resolved} style={css} />
        </div>
      );
    default:
      return null;
  }
}

function getEditableText(element: TemplateElement): string | null {
  const content = resolveElement(element, 'desktop').content;
  if ('text' in content) return content.text;
  if ('label' in content) return content.label;
  return null;
}

function nextContentFor(element: TemplateElement, text: string): ElementContent {
  switch (element.type) {
    case 'heading':
    case 'text':
      return { text };
    case 'button':
      return { label: text, href: (resolveElement(element, 'desktop').content as { href: string }).href };
    default:
      return { text };
  }
}
