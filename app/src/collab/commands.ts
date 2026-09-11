import type { EditCommand, RevisionEntry } from '../types/commands';
import type { StyleMutationPatch, TemplateDoc } from '../types/template';
import { STYLE_PROPS } from '../types/template';

/**
 * The subset of a revision entry needed to compute its inverse commands.
 * Accepts both legacy RevisionEntry and CollabRevisionEntry shapes.
 */
export type InvertibleRevision = Pick<
  RevisionEntry,
  'elementId' | 'scope' | 'before' | 'after' | 'structural'
>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

/**
 * Translate a revision entry back into the EditCommands that undo it, so
 * restore/undo/redo can flow through the same command pipeline as every
 * other edit.
 *
 * Returns an empty array when the entry cannot be inverted (missing
 * elements, an override delete that is not expressible as a command, or a
 * removed root that has already been re-added). Callers skip empty results,
 * mirroring how invertRevisionGroup skips non-invertible entries.
 *
 * Commands are emitted against `doc` (the state the entry was applied to):
 * inverse commands carry source 'restore' so they re-validate naturally on
 * the state they are meant to undo.
 */
export function commandsFromRevision(doc: TemplateDoc, entry: InvertibleRevision): EditCommand[] {
  const structural = entry.structural;

  if (structural) {
    if (structural.op === 'reorder') {
      const element = doc.elements[entry.elementId];
      const parent = element?.parentId ? doc.elements[element.parentId] : undefined;
      if (!element || !element.parentId || !parent || structural.previousIndex === undefined) {
        return [];
      }
      return [
        {
          kind: 'reorder',
          source: 'restore',
          targetIds: [entry.elementId],
          scope: entry.scope,
          index: structural.previousIndex,
        },
      ];
    }

    if (structural.op === 'insert') {
      const element = doc.elements[entry.elementId];
      if (!element || !element.parentId) return [];
      return [
        {
          kind: 'remove',
          source: 'restore',
          targetIds: [entry.elementId],
          scope: entry.scope,
        },
      ];
    }

    if (structural.op === 'remove') {
      const subtree = structural.removedSubtree ?? [];
      const parentId = structural.parentId;
      const parent = parentId ? doc.elements[parentId] : undefined;
      if (!parentId || !parent || subtree.length === 0) return [];
      if (doc.elements[subtree[0].id]) return [];
      const index = clamp(
        structural.index ?? parent.childIds.length,
        0,
        parent.childIds.length,
      );

      const insertCommands: EditCommand[] = [];
      subtree.forEach((captured, i) => {
        if (i === 0) {
          insertCommands.push({
            kind: 'insert',
            source: 'restore',
            targetIds: [],
            scope: entry.scope,
            parentId,
            index,
            element: { ...clone(captured), childIds: [] },
          });
          return;
        }
        const capturedParent = captured.parentId
          ? subtree.find((e) => e.id === captured.parentId)
          : undefined;
        const inParent = capturedParent
          ? capturedParent.childIds.indexOf(captured.id)
          : -1;
        insertCommands.push({
          kind: 'insert',
          source: 'restore',
          targetIds: [],
          scope: entry.scope,
          parentId: captured.parentId ?? parentId,
          index: inParent >= 0 ? inParent : 0,
          element: { ...clone(captured), childIds: [] },
        });
      });
      return insertCommands;
    }
  }

  const element = doc.elements[entry.elementId];
  if (!element) return [];

  const beforeContent = entry.before.content;
  if (beforeContent !== undefined) {
    return [
      {
        kind: 'set-content',
        source: 'restore',
        targetIds: [entry.elementId],
        scope: entry.scope,
        content: clone(beforeContent),
      },
    ];
  }

  if (entry.after.content !== undefined) {
    // Override delete (viewport) or base no-op: restore handles both by
    // removing an override scope, which is not expressible as a command.
    return [];
  }

  const beforeStyle = entry.before.style;
  if (!beforeStyle || Object.keys(beforeStyle).length === 0) return [];

  // `null` means "was unset": keep it as null so the deletion is expressible
  // over JSON control frames (undefined keys are dropped on the wire).
  const stylePatch: StyleMutationPatch = {};
  for (const [key, value] of Object.entries(beforeStyle)) {
    if (STYLE_PROPS.has(key)) {
      (stylePatch as Record<string, number | string | null>)[key] = value;
    }
  }
  return [
    {
      kind: 'set-style',
      source: 'restore',
      targetIds: [entry.elementId],
      scope: entry.scope,
      stylePatch,
    },
  ];
}
