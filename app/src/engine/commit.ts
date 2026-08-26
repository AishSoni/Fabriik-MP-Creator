import { produce } from 'immer';
import type {
  EditCommand,
  HistoryLog,
  RevisionEntry,
  RevisionKind,
} from '../types/commands';
import type {
  ElementContent,
  TemplateDoc,
  TemplateElement,
} from '../types/template';
import type { Scope, Viewport } from '../types/viewport';
import { getSubtreeIds } from './resolve';

export interface CommitResult {
  doc: TemplateDoc;
  revisions: RevisionEntry[];
}

let revisionCounter = 0;
const nextRevisionId = () => `rev-${Date.now().toString(36)}-${(revisionCounter++).toString(36)}`;
export const commandIdFor = (cmd: EditCommand, seq: number) =>
  `cmd-${cmd.source}-${cmd.kind}-${cmd.baseRevision}-${seq}`;

function isViewportScope(scope: Scope): scope is Viewport {
  return scope !== 'all';
}

function writeStyleLayer(
  element: TemplateElement,
  scope: Scope,
  patch: Record<string, number | string | undefined>,
): { before: Record<string, number | string | undefined>; after: Record<string, number | string | undefined> } {
  const layer = isViewportScope(scope)
    ? ((element.style.overrides ??= {})[scope] ??= {})
    : element.style.base;
  const keys = Object.keys(patch);
  const before: Record<string, number | string | undefined> = {};
  const after: Record<string, number | string | undefined> = {};
  for (const key of keys) {
    before[key] = (layer as Record<string, number | string | undefined>)[key];
    (layer as Record<string, number | string | undefined>)[key] = patch[key];
    after[key] = patch[key];
  }
  return { before, after };
}

function readContentLayer(element: TemplateElement, scope: Scope): ElementContent | undefined {
  if (isViewportScope(scope)) return element.content.overrides?.[scope];
  return element.content.base;
}

function writeContentLayer(
  element: TemplateElement,
  scope: Scope,
  content: ElementContent,
): ElementContent | undefined {
  const before = readContentLayer(element, scope);
  if (isViewportScope(scope)) {
    (element.content.overrides ??= {})[scope] = content;
  } else {
    element.content.base = content;
  }
  return before;
}

function describe(cmd: EditCommand, kind: RevisionKind): string {
  switch (cmd.kind) {
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

export function applyCommand(doc: TemplateDoc, command: EditCommand): CommitResult {
  const revisions: RevisionEntry[] = [];
  let seq = 0;

  const nextDoc = produce(doc, (draft) => {
    draft.revision += 1;

    const recordRevision = (
      entry: Omit<RevisionEntry, 'id' | 'commandId' | 'baseRevision' | 'timestamp'>,
    ) => {
      revisions.push({
        ...entry,
        id: nextRevisionId(),
        commandId: commandIdFor(command, seq),
        baseRevision: doc.revision,
        timestamp: Date.now(),
      });
      seq += 1;
    };

    const kindOf = (): RevisionKind =>
      command.source === 'ai'
        ? 'ai-accepted'
        : command.kind === 'set-content' || command.kind === 'set-style'
          ? 'manual'
          : 'structure';

    const kind = kindOf();
    const label = describe(command, kind);

    switch (command.kind) {
      case 'set-content': {
        const id = command.targetIds[0];
        const element = draft.elements[id];
        if (!element) break;
        const before = writeContentLayer(element as TemplateElement, command.scope, command.content);
        recordRevision({
          elementId: id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: { content: before },
          after: { content: readContentLayer(element as TemplateElement, command.scope) },
        });
        break;
      }
      case 'set-style': {
        for (const id of command.targetIds) {
          const element = draft.elements[id];
          if (!element) continue;
          const { before, after } = writeStyleLayer(
            element as TemplateElement,
            command.scope,
            command.stylePatch,
          );
          recordRevision({
            elementId: id,
            scope: command.scope,
            source: command.source,
            kind,
            label,
            before: { style: before },
            after: { style: after },
          });
        }
        break;
      }
      case 'reorder': {
        const id = command.targetIds[0];
        const element = draft.elements[id];
        if (!element || !element.parentId) break;
        const parent = draft.elements[element.parentId];
        const currentIndex = parent.childIds.indexOf(id);
        if (currentIndex === -1) break;
        const clamped = Math.max(0, Math.min(command.index, parent.childIds.length - 1));
        parent.childIds.splice(currentIndex, 1);
        parent.childIds.splice(clamped, 0, id);
        recordRevision({
          elementId: id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: {},
          after: {},
          structural: {
            op: 'reorder',
            parentId: parent.id,
            previousIndex: currentIndex,
            index: clamped,
          },
        });
        break;
      }
      case 'insert': {
        const parent = draft.elements[command.parentId];
        if (!parent) break;
        const index = Math.max(0, Math.min(command.index, parent.childIds.length));
        const element = command.element;
        parent.childIds.splice(index, 0, element.id);
        draft.elements[element.id] = element;
        recordRevision({
          elementId: element.id,
          scope: command.scope,
          source: command.source,
          kind,
          label,
          before: {},
          after: { element },
          structural: { op: 'insert', parentId: parent.id, index },
        });
        break;
      }
      case 'remove': {
        for (const id of command.targetIds) {
          const element = draft.elements[id];
          if (!element || !element.parentId) continue;
          const parent = draft.elements[element.parentId];
          const index = parent.childIds.indexOf(id);
          if (index === -1) continue;
          const subtreeIds = getSubtreeIds(draft as unknown as TemplateDoc, id);
          const removedSubtree = subtreeIds
            .map((subId) => draft.elements[subId])
            .filter((e): e is TemplateElement => Boolean(e));
          parent.childIds.splice(index, 1);
          for (const subId of subtreeIds) delete draft.elements[subId];
          recordRevision({
            elementId: id,
            scope: command.scope,
            source: command.source,
            kind,
            label,
            before: { element: JSON.parse(JSON.stringify(removedSubtree[0])) },
            after: {},
            structural: {
              op: 'remove',
              parentId: parent.id,
              index,
              removedSubtree: JSON.parse(JSON.stringify(removedSubtree)),
            },
          });
        }
        break;
      }
    }
  });

  return { doc: nextDoc, revisions };
}

export function appendRevisions(history: HistoryLog, revisions: RevisionEntry[]): HistoryLog {
  const next: HistoryLog = { ...history };
  for (const rev of revisions) {
    next[rev.elementId] = [...(next[rev.elementId] ?? []), rev];
  }
  return next;
}

export function commitCommand(doc: TemplateDoc, history: HistoryLog, command: EditCommand): {
  doc: TemplateDoc;
  history: HistoryLog;
  revisions: RevisionEntry[];
} {
  const result = applyCommand(doc, command);
  return {
    doc: result.doc,
    revisions: result.revisions,
    history: appendRevisions(history, result.revisions),
  };
}


