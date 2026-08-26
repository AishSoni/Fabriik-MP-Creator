import { produce } from 'immer';
import type { RevisionEntry } from '../types/commands';
import type { ElementContent, ElementId, TemplateDoc, TemplateElement } from '../types/template';
import type { Scope } from '../types/viewport';
import { getSubtreeIds } from './resolve';

export interface RestoreResult {
  doc: TemplateDoc;
  revision: RevisionEntry | null;
}

function isViewportScope(scope: Scope): scope is Exclude<Scope, 'all'> {
  return scope !== 'all';
}

function writeStyleValues(
  element: TemplateElement,
  scope: Scope,
  values: Record<string, number | string | undefined>,
) {
  const layer = isViewportScope(scope)
    ? ((element.style.overrides ??= {})[scope] ??= {})
    : element.style.base;
  for (const [key, value] of Object.entries(values)) {
    (layer as Record<string, unknown>)[key] = value;
  }
}

function captureSubtree(doc: TemplateDoc, rootId: ElementId): TemplateElement[] {
  return getSubtreeIds(doc, rootId)
    .map((id) => doc.elements[id])
    .filter((e): e is TemplateElement => Boolean(e))
    .map((e) => JSON.parse(JSON.stringify(e)) as TemplateElement);
}

export function restoreRevision(doc: TemplateDoc, entry: RevisionEntry): RestoreResult {
  const structural = entry.structural;
  let restoreEntry: RevisionEntry | null = null;

  const nextDoc = produce(doc, (draft) => {
    draft.revision += 1;

    const base = {
      elementId: entry.elementId,
      scope: entry.scope,
      source: 'restore' as const,
      kind: 'restore' as const,
      label: `restored to revision ${entry.id}`,
      baseRevision: entry.baseRevision,
    };

    if (!structural) {
      const element = draft.elements[entry.elementId];
      if (!element) return;
      if (entry.before.content !== undefined || entry.after.content !== undefined) {
        const beforeContent = entry.before.content;
        const afterContentRaw =
          entry.after.content ??
          (isViewportScope(entry.scope)
            ? element.content.overrides?.[entry.scope]
            : element.content.base);
        const afterContent = afterContentRaw
          ? (JSON.parse(JSON.stringify(afterContentRaw)) as ElementContent)
          : undefined;
        if (beforeContent === undefined) {
          if (!isViewportScope(entry.scope)) return;
          if (element.content.overrides && entry.scope in element.content.overrides) {
            delete element.content.overrides[entry.scope];
            if (Object.keys(element.content.overrides).length === 0) {
              delete element.content.overrides;
            }
          }
          restoreEntry = {
            ...base,
            id: `rev-${draft.revision}-${Math.random().toString(36).slice(2, 8)}`,
            commandId: `restore-${entry.id}`,
            before: { content: afterContent },
            after: {},
            timestamp: Date.now(),
          };
          return;
        }
        if (isViewportScope(entry.scope)) {
          (element.content.overrides ??= {})[entry.scope] = JSON.parse(
            JSON.stringify(beforeContent),
          );
        } else {
          element.content.base = JSON.parse(JSON.stringify(beforeContent));
        }
        restoreEntry = {
          ...base,
          id: `rev-${draft.revision}-${Math.random().toString(36).slice(2, 8)}`,
          commandId: `restore-${entry.id}`,
          before: { content: afterContent },
          after: { content: beforeContent },
          timestamp: Date.now(),
        };
        return;
      }
      const beforeStyle = entry.before.style;
      if (beforeStyle && Object.keys(beforeStyle).length > 0) {
        const currentLayer = isViewportScope(entry.scope)
          ? element.style.overrides?.[entry.scope]
          : element.style.base;
        const afterStyle: Record<string, number | string | undefined> = {};
        for (const key of Object.keys(beforeStyle)) {
          afterStyle[key] = (currentLayer as Record<string, number | string | undefined> | undefined)?.[key];
        }
        writeStyleValues(element as TemplateElement, entry.scope, beforeStyle);
        restoreEntry = {
          ...base,
          id: `rev-${draft.revision}-${Math.random().toString(36).slice(2, 8)}`,
          commandId: `restore-${entry.id}`,
          before: { style: afterStyle },
          after: { style: { ...beforeStyle } },
          timestamp: Date.now(),
        };
      }
      return;
    }

    if (structural.op === 'remove') {
      const subtree = structural.removedSubtree ?? [];
      const parent = structural.parentId ? draft.elements[structural.parentId] : undefined;
      if (!parent || subtree.length === 0) return;
      if (draft.elements[subtree[0].id]) return;
      for (const element of subtree) {
        draft.elements[element.id] = JSON.parse(JSON.stringify(element));
      }
      const index = Math.max(0, Math.min(structural.index ?? parent.childIds.length, parent.childIds.length));
      parent.childIds.splice(index, 0, subtree[0].id);
      restoreEntry = {
        ...base,
        id: `rev-${draft.revision}-${Math.random().toString(36).slice(2, 8)}`,
        commandId: `restore-${entry.id}`,
        before: {},
        after: { element: subtree[0] },
        structural: { op: 'insert', parentId: parent.id, index },
        timestamp: Date.now(),
      };
      return;
    }

    if (structural.op === 'insert') {
      const element = draft.elements[entry.elementId];
      if (!element || !element.parentId) return;
      const parent = draft.elements[element.parentId];
      const index = parent.childIds.indexOf(element.id);
      if (index === -1) return;
      const removed = captureSubtree(draft as unknown as TemplateDoc, element.id);
      parent.childIds.splice(index, 1);
      for (const item of removed) delete draft.elements[item.id];
      restoreEntry = {
        ...base,
        id: `rev-${draft.revision}-${Math.random().toString(36).slice(2, 8)}`,
        commandId: `restore-${entry.id}`,
        before: {},
        after: {},
        structural: {
          op: 'remove',
          parentId: parent.id,
          index,
          removedSubtree: removed,
        },
        timestamp: Date.now(),
      };
      return;
    }

    if (structural.op === 'reorder') {
      const element = draft.elements[entry.elementId];
      if (!element || !element.parentId) return;
      const parent = draft.elements[element.parentId];
      const currentIndex = parent.childIds.indexOf(element.id);
      if (currentIndex === -1 || structural.previousIndex === undefined) return;
      const target = Math.max(0, Math.min(structural.previousIndex, parent.childIds.length - 1));
      parent.childIds.splice(currentIndex, 1);
      parent.childIds.splice(target, 0, element.id);
      restoreEntry = {
        ...base,
        id: `rev-${draft.revision}-${Math.random().toString(36).slice(2, 8)}`,
        commandId: `restore-${entry.id}`,
        before: {},
        after: {},
        structural: { op: 'reorder', parentId: parent.id, previousIndex: target, index: currentIndex },
        timestamp: Date.now(),
      };
    }
  });

  return { doc: nextDoc, revision: restoreEntry };
}

