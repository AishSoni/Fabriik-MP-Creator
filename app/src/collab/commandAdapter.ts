import * as Y from 'yjs';
import type {
  EditCommand,
  RevisionEntry,
  RevisionKind,
  StyleSnapshot,
} from '../types/commands';
import type { ElementContent, ElementId, TemplateElement } from '../types/template';
import { isViewport } from '../types/viewport';
import type { Scope } from '../types/viewport';
import {
  BASE_LAYER,
  CHILD_IDS_FIELD,
  CONTENT_FIELD,
  OVERRIDES_LAYER,
  PARENT_ID_FIELD,
  STYLE_FIELD,
  TRANSACTION_ORIGIN,
  buildElementYMap,
  getElementsYMap,
  getHistoryYArray,
  projectElement,
} from './schema';

export type CollabRevisionEntry = Omit<RevisionEntry, 'baseRevision'> & {
  serverSeq?: number;
};

export interface ApplyOptions {
  origin: 'optimistic' | 'authoritative';
  commandId: string;
  serverSeq?: number;
  now?: () => number;
}

export interface ApplyResult {
  entries: CollabRevisionEntry[];
  changedElementIds: ElementId[];
}

type EntrySeed = Omit<CollabRevisionEntry, 'id' | 'commandId' | 'serverSeq' | 'timestamp'>;

let revisionCounter = 0;

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function nullifyStyle(record: Record<string, number | string | undefined>): StyleSnapshot {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value === undefined ? null : value]),
  );
}

function kindOf(command: EditCommand): RevisionKind {
  return command.source === 'ai'
    ? 'ai-accepted'
    : command.kind === 'set-content' || command.kind === 'set-style'
      ? 'manual'
      : 'structure';
}

function describe(command: EditCommand, kind: RevisionKind): string {
  switch (command.kind) {
    case 'set-content':
      return `content updated (${kind})`;
    case 'set-style':
      return `style updated (${kind})`;
    case 'reorder':
      return `reordered (${kind})`;
    case 'insert':
      return `element inserted (${kind})`;
    case 'remove':
      return `element removed (${kind})`;
  }
}

function resolveScopedLayer(layerMap: Y.Map<unknown>, scope: Scope): Y.Map<unknown> {
  if (!isViewport(scope)) {
    return layerMap.get(BASE_LAYER) as Y.Map<unknown>;
  }
  const overrides = layerMap.get(OVERRIDES_LAYER) as Y.Map<Y.Map<unknown>> | undefined;
  const existing = overrides?.get(scope);
  if (existing) return existing;
  const created = new Y.Map<unknown>();
  if (overrides) {
    overrides.set(scope, created);
  } else {
    const fresh = new Y.Map<Y.Map<unknown>>();
    fresh.set(scope, created);
    layerMap.set(OVERRIDES_LAYER, fresh);
  }
  return created;
}

function readScopedLayer(layerMap: Y.Map<unknown>, scope: Scope): unknown {
  if (!isViewport(scope)) {
    return (layerMap.get(BASE_LAYER) as Y.Map<unknown>).toJSON();
  }
  const overrides = layerMap.get(OVERRIDES_LAYER) as Y.Map<Y.Map<unknown>> | undefined;
  return overrides?.get(scope)?.toJSON();
}

function getSubtreeYIds(elements: Y.Map<Y.Map<unknown>>, rootId: ElementId): ElementId[] {
  const ids: ElementId[] = [];
  const stack: ElementId[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const ymap = elements.get(current);
    if (!ymap) continue;
    ids.push(current);
    const childIds = ymap.get(CHILD_IDS_FIELD) as Y.Array<ElementId>;
    const children = childIds.toArray();
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  return ids;
}

export function applyCommandToYDoc(
  ydoc: Y.Doc,
  command: EditCommand,
  opts: ApplyOptions,
): ApplyResult {
  const entries: CollabRevisionEntry[] = [];
  const changed = new Set<ElementId>();
  const now = opts.now ?? Date.now;
  const elements = getElementsYMap(ydoc);
  const kind = kindOf(command);
  const label = describe(command, kind);

  ydoc.transact(() => {
    const record = (seed: EntrySeed): void => {
      const entry: CollabRevisionEntry = {
        ...seed,
        id: `rev-${now().toString(36)}-${(revisionCounter++).toString(36)}`,
        commandId: opts.commandId,
        serverSeq: opts.serverSeq,
        timestamp: now(),
      };
      entries.push(entry);
    };

    switch (command.kind) {
      case 'set-content': {
        const id = command.targetIds[0];
        const ymap = elements.get(id);
        if (!ymap) break;
        const contentMap = ymap.get(CONTENT_FIELD) as Y.Map<unknown>;
        const before = readScopedLayer(contentMap, command.scope) as ElementContent | undefined;
        const layer = resolveScopedLayer(contentMap, command.scope);
        for (const [key, value] of Object.entries(command.content)) {
          layer.set(key, cloneJson(value));
        }
        record({
          elementId: id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: { content: cloneJson(before) },
          after: { content: cloneJson(layer.toJSON()) },
        });
        changed.add(id);
        break;
      }
      case 'set-style': {
        for (const id of command.targetIds) {
          const ymap = elements.get(id);
          if (!ymap) continue;
          const styleMap = ymap.get(STYLE_FIELD) as Y.Map<unknown>;
          const layer = resolveScopedLayer(styleMap, command.scope);
          const before: Record<string, number | string | undefined> = {};
          const after: Record<string, number | string | undefined> = {};
          for (const [key, value] of Object.entries(command.stylePatch)) {
            before[key] = layer.get(key) as number | string | undefined;
            layer.set(key, value);
            after[key] = value;
          }
          record({
            elementId: id,
            scope: command.scope,
            source: command.source,
            kind,
            label,
            before: { style: nullifyStyle(before) },
            after: { style: nullifyStyle(after) },
          });
          changed.add(id);
        }
        break;
      }
      case 'reorder': {
        const id = command.targetIds[0];
        const ymap = elements.get(id);
        if (!ymap) break;
        const parentId = ymap.get(PARENT_ID_FIELD) as ElementId | null;
        if (!parentId) break;
        const parent = elements.get(parentId);
        if (!parent) break;
        const childIds = parent.get(CHILD_IDS_FIELD) as Y.Array<ElementId>;
        const currentIndex = childIds.toArray().indexOf(id);
        if (currentIndex === -1) break;
        const clamped = Math.max(0, Math.min(command.index, childIds.length - 1));
        childIds.delete(currentIndex, 1);
        childIds.insert(clamped, [id]);
        record({
          elementId: id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: {},
          after: {},
          structural: {
            op: 'reorder',
            parentId,
            previousIndex: currentIndex,
            index: clamped,
          },
        });
        changed.add(id);
        changed.add(parentId);
        break;
      }
      case 'insert': {
        const parent = elements.get(command.parentId);
        if (!parent) break;
        const childIds = parent.get(CHILD_IDS_FIELD) as Y.Array<ElementId>;
        const index = Math.max(0, Math.min(command.index, childIds.length));
        const element: TemplateElement = { ...command.element, parentId: command.parentId };
        childIds.insert(index, [element.id]);
        elements.set(element.id, buildElementYMap(element));
        record({
          elementId: element.id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: {},
          after: { element: cloneJson(element) },
          structural: { op: 'insert', parentId: command.parentId, index },
        });
        changed.add(element.id);
        changed.add(command.parentId);
        break;
      }
      case 'remove': {
        for (const id of command.targetIds) {
          const ymap = elements.get(id);
          if (!ymap) continue;
          const parentId = ymap.get(PARENT_ID_FIELD) as ElementId | null;
          if (!parentId) continue;
          const parent = elements.get(parentId);
          if (!parent) continue;
          const childIds = parent.get(CHILD_IDS_FIELD) as Y.Array<ElementId>;
          const index = childIds.toArray().indexOf(id);
          if (index === -1) continue;
          const subtreeIds = getSubtreeYIds(elements, id);
          const removedSubtree = subtreeIds
            .map((subId) => elements.get(subId))
            .filter((sub): sub is Y.Map<unknown> => Boolean(sub))
            .map((sub) => projectElement(sub));
          childIds.delete(index, 1);
          for (const subId of subtreeIds) {
            elements.delete(subId);
          }
          record({
            elementId: id,
            scope: command.scope,
            source: command.source,
            kind,
            label,
            before: { element: cloneJson(removedSubtree[0]) },
            after: {},
            structural: {
              op: 'remove',
              parentId,
              index,
              removedSubtree: cloneJson(removedSubtree),
            },
          });
          changed.add(id);
          changed.add(parentId);
        }
        break;
      }
    }

    if (opts.origin === 'authoritative' && entries.length > 0) {
      getHistoryYArray(ydoc).push(entries);
    }
  }, TRANSACTION_ORIGIN);

  return { entries, changedElementIds: [...changed] };
}
