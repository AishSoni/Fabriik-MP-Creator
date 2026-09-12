import * as Y from 'yjs';
import type {
  EditCommand,
  RevisionKind,
  StyleSnapshot,
} from '../types/commands';
import type { ElementContent, ElementId, TemplateDoc, TemplateElement } from '../types/template';
import { isViewport } from '../types/viewport';
import type { Scope } from '../types/viewport';
import {
  OVERRIDES_LAYER,
  ROOT_ID_FIELD,
  TEMPLATE_ID_FIELD,
  TEMPLATE_NAME_FIELD,
  TRANSACTION_ORIGIN,
  buildElementYMap,
  getElementsYMap,
  getHistoryYArray,
  getMetaYMap,
  projectElement,
  readBaseLayer,
  readChildIdsYArray,
  readContentLayer,
  readOverridesLayers,
  readParentId,
  readStyleLayer,
  type ContentLayerValue,
  type HistoryEntry,
  type LayerValue,
  type StyleLayerValue,
  type YElement,
  type YScopedLayer,
  type YValueLayer,
} from './schema';

export type CollabRevisionEntry = HistoryEntry;

export interface ApplyOptions {
  origin: 'optimistic' | 'authoritative' | 'room-optimistic';
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

function nullifyStyle(record: Record<string, StyleLayerValue>): StyleSnapshot {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value === undefined ? null : value]),
  );
}

function kindOf(command: EditCommand): RevisionKind {
  if (command.source === 'restore') return 'restore';
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
    case 'rename':
      return `template renamed (${kind})`;
    case 'replace-doc':
      return `document replaced (${kind})`;
  }
}

function resolveScopedLayer<V extends LayerValue>(
  scoped: YScopedLayer<V>,
  scope: Scope,
): YValueLayer<V> {
  if (!isViewport(scope)) {
    return readBaseLayer(scoped);
  }
  const overrides = readOverridesLayers(scoped);
  const existing = overrides?.get(scope);
  if (existing) return existing;
  const created = new Y.Map<V>();
  if (overrides) {
    overrides.set(scope, created);
  } else {
    const fresh = new Y.Map<Y.Map<V>>();
    fresh.set(scope, created);
    scoped.set(OVERRIDES_LAYER, fresh);
  }
  return created;
}

function readScopedLayer<V extends LayerValue>(
  scoped: YScopedLayer<V>,
  scope: Scope,
): Record<string, V> | undefined {
  if (!isViewport(scope)) {
    return readBaseLayer(scoped).toJSON();
  }
  return readOverridesLayers(scoped)?.get(scope)?.toJSON();
}

function getSubtreeYIds(elements: Y.Map<YElement>, rootId: ElementId): ElementId[] {
  const ids: ElementId[] = [];
  const stack: ElementId[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const ymap = elements.get(current);
    if (!ymap) continue;
    ids.push(current);
    const children = readChildIdsYArray(ymap).toArray();
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
        const contentLayer = readContentLayer(ymap);
        const beforeLayer = readScopedLayer(contentLayer, command.scope);
        const layer = resolveScopedLayer(contentLayer, command.scope);
        const patch = command.content as Record<string, ContentLayerValue>;
        for (const [key, value] of Object.entries(patch)) {
          layer.set(key, cloneJson(value));
        }
        record({
          elementId: id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: { content: cloneJson(beforeLayer) as ElementContent | undefined },
          after: { content: cloneJson(layer.toJSON()) as ElementContent },
        });
        changed.add(id);
        break;
      }
      case 'set-style': {
        for (const id of command.targetIds) {
          const ymap = elements.get(id);
          if (!ymap) continue;
          const styleLayer = readStyleLayer(ymap);
          const layer = resolveScopedLayer(styleLayer, command.scope);
          const patch = command.stylePatch as Record<string, StyleLayerValue | null | undefined>;
          const before: Record<string, StyleLayerValue> = {};
          const after: Record<string, StyleLayerValue> = {};
          for (const [key, value] of Object.entries(patch)) {
            before[key] = layer.get(key);
            if (value === null || value === undefined) {
              layer.delete(key);
              after[key] = undefined;
            } else {
              layer.set(key, value);
              after[key] = value;
            }
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
        const parentId = readParentId(ymap);
        if (!parentId) break;
        const parent = elements.get(parentId);
        if (!parent) break;
        const childIds = readChildIdsYArray(parent);
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
        const childIds = readChildIdsYArray(parent);
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
          const parentId = readParentId(ymap);
          if (!parentId) continue;
          const parent = elements.get(parentId);
          if (!parent) continue;
          const childIds = readChildIdsYArray(parent);
          const index = childIds.toArray().indexOf(id);
          if (index === -1) continue;
          const subtreeIds = getSubtreeYIds(elements, id);
          const removedSubtree = subtreeIds
            .map((subId) => elements.get(subId))
            .filter((sub): sub is YElement => Boolean(sub))
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
      case 'rename': {
        getMetaYMap(ydoc).set(TEMPLATE_NAME_FIELD, command.templateName);
        break;
      }
      case 'replace-doc': {
        for (const id of replaceYDocInTransaction(ydoc, command.doc)) {
          changed.add(id);
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

/**
 * Replaces every element plus meta and clears history inside the caller's
 * transaction. Shared by the standalone `replaceYDoc` tool and the
 * `replace-doc` command so both swap the document atomically.
 */
function replaceYDocInTransaction(ydoc: Y.Doc, nextDoc: TemplateDoc): ElementId[] {
  const changedElementIds: ElementId[] = [];
  const elements = getElementsYMap(ydoc);
  for (const existingId of [...elements.keys()]) {
    elements.delete(existingId);
  }
  const history = getHistoryYArray(ydoc);
  history.delete(0, history.length);
  const meta = getMetaYMap(ydoc);
  meta.set(TEMPLATE_ID_FIELD, nextDoc.templateId);
  meta.set(TEMPLATE_NAME_FIELD, nextDoc.templateName);
  meta.set(ROOT_ID_FIELD, nextDoc.rootId);
  for (const element of Object.values(nextDoc.elements)) {
    elements.set(element.id, buildElementYMap(element));
  }
  changedElementIds.push(...Object.keys(nextDoc.elements));
  return changedElementIds;
}

export const replaceYDoc = (ydoc: Y.Doc, nextDoc: TemplateDoc): ApplyResult => {
  let changedElementIds: ElementId[] = [];
  ydoc.transact(() => {
    changedElementIds = replaceYDocInTransaction(ydoc, nextDoc);
  }, TRANSACTION_ORIGIN);
  return { entries: [], changedElementIds };
};
