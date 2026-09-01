import type { EditCommand } from '../types/commands';
import type { ElementContent, ElementId, ScopedContent, ScopedStyle, TemplateDoc } from '../types/template';

export interface DiffOptions {
  source: 'code' | 'ai';
}

export function diffDocs(oldDoc: TemplateDoc, newDoc: TemplateDoc, options: DiffOptions): {
  commands: EditCommand[];
  errors: string[];
} {
  const errors: string[] = [];
  const commands: EditCommand[] = [];

  if (newDoc.templateId !== oldDoc.templateId) {
    errors.push('templateId cannot be changed');
  }
  if (newDoc.rootId !== oldDoc.rootId) {
    errors.push('rootId cannot be changed');
  }
  if (newDoc.revision !== oldDoc.revision) {
    errors.push('revision field is managed by the editor and cannot be changed');
  }
  if (errors.length > 0) return { commands, errors };

  const oldIds = new Set(Object.keys(oldDoc.elements));
  const newIds = new Set(Object.keys(newDoc.elements));

  for (const id of oldIds) {
    if (id === oldDoc.rootId || newIds.has(id)) continue;
    const removed = oldDoc.elements[id];
    const parentId = removed?.parentId;
    if (!parentId || newIds.has(parentId)) {
      commands.push({
        kind: 'remove',
        source: options.source,
        targetIds: [id],
        scope: 'all',
        baseRevision: 0,
      });
    }
  }

  for (const [id, next] of Object.entries(newDoc.elements)) {
    const prev = oldDoc.elements[id];
    if (!prev) {
      commands.push({
        kind: 'insert',
        source: options.source,
        targetIds: [],
        scope: 'all',
        baseRevision: 0,
        parentId: next.parentId ?? newDoc.rootId,
        index: insertionIndex(newDoc, next.parentId ?? newDoc.rootId, id),
        element: stripTransient(next),
      });
      continue;
    }
    if (prev.type !== next.type || prev.parentId !== next.parentId) {
      if (prev.childIds.length > 0) {
        const what = prev.type !== next.type ? `type (${prev.type} → ${next.type})` : `parent (${prev.parentId} → ${next.parentId})`;
        errors.push(
          `element "${id}": changing ${what} on elements with children is not supported — remove and re-add the element instead`,
        );
        continue;
      }
      const oldParentGone = !prev.parentId || !newIds.has(prev.parentId);
      if (!oldParentGone) {
        commands.push({
          kind: 'remove',
          source: options.source,
          targetIds: [id],
          scope: 'all',
          baseRevision: 0,
        });
      }
      commands.push({
        kind: 'insert',
        source: options.source,
        targetIds: [],
        scope: 'all',
        baseRevision: 0,
        parentId: next.parentId ?? newDoc.rootId,
        index: insertionIndex(newDoc, next.parentId ?? newDoc.rootId, id),
        element: stripTransient(next),
      });
      continue;
    }
    appendPropertyCommands(commands, id, prev.content, next.content, prev.style, next.style, options.source);
  }

  const parentIds = new Set<string>([
    ...Object.keys(oldDoc.elements),
    ...Object.keys(newDoc.elements),
  ]);
  for (const parentId of parentIds) {
    const prevParent = oldDoc.elements[parentId];
    const nextParent = newDoc.elements[parentId];
    if (!prevParent || !nextParent) continue;
    const prevChildren = prevParent.childIds.filter((cid) => newIds.has(cid));
    const nextChildren = [...nextParent.childIds];
    for (const wanted of nextChildren) {
      const wantedElement = newDoc.elements[wanted];
      if (!wantedElement) {
        errors.push(`element "${parentId}": childIds reference unknown element "${wanted}"`);
      } else if (wantedElement.parentId !== parentId) {
        errors.push(
          `element "${wanted}": childIds of "${parentId}" and parentId "${wantedElement.parentId}" disagree`,
        );
      }
    }
    let current = [...prevChildren];
    for (let targetIndex = 0; targetIndex < nextChildren.length; targetIndex++) {
      const wanted = nextChildren[targetIndex];
      const currentIndex = current.indexOf(wanted);
      if (currentIndex === targetIndex) continue;
      if (currentIndex === -1) continue;
      current.splice(currentIndex, 1);
      current.splice(targetIndex, 0, wanted);
      commands.push({
        kind: 'reorder',
        source: options.source,
        targetIds: [wanted],
        scope: 'all',
        baseRevision: 0,
        index: targetIndex,
      });
    }
  }

  return { commands, errors };
}

function insertionIndex(doc: TemplateDoc, parentId: ElementId, childId: ElementId): number {
  const parent = doc.elements[parentId];
  if (!parent) return 0;
  const index = parent.childIds.indexOf(childId);
  return index === -1 ? parent.childIds.length : index;
}

function appendPropertyCommands(
  commands: EditCommand[],
  id: ElementId,
  prevContent: ScopedContent,
  nextContent: ScopedContent,
  prevStyle: ScopedStyle,
  nextStyle: ScopedStyle,
  source: 'code' | 'ai',
) {
  const viewports = new Set([
    ...(prevContent.overrides ? Object.keys(prevContent.overrides) : []),
    ...(nextContent.overrides ? Object.keys(nextContent.overrides) : []),
    ...(prevStyle.overrides ? Object.keys(prevStyle.overrides) : []),
    ...(nextStyle.overrides ? Object.keys(nextStyle.overrides) : []),
  ] as (keyof NonNullable<ScopedStyle['overrides']>)[]);

  if (!contentEquals(prevContent.base, nextContent.base)) {
    commands.push({
      kind: 'set-content',
      source,
      targetIds: [id],
      scope: 'all',
      baseRevision: 0,
      content: nextContent.base,
    });
  }

  if (!styleEquals(prevStyle.base as Record<string, unknown>, nextStyle.base as Record<string, unknown>)) {
    const patch: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(prevStyle.base as Record<string, unknown>),
      ...Object.keys(nextStyle.base as Record<string, unknown>),
    ]);
    for (const key of keys) {
      if (!shallowEqual((prevStyle.base as Record<string, unknown>)[key], (nextStyle.base as Record<string, unknown>)[key])) {
        patch[key] = (nextStyle.base as Record<string, unknown>)[key];
      }
    }
    commands.push({
      kind: 'set-style',
      source,
      targetIds: [id],
      scope: 'all',
      baseRevision: 0,
      stylePatch: patch,
    });
  }

  for (const vp of viewports) {
    const prevOverrideContent = prevContent.overrides?.[vp];
    const nextOverrideContent = nextContent.overrides?.[vp];
    if (!contentEquals(prevOverrideContent, nextOverrideContent)) {
      commands.push({
        kind: 'set-content',
        source,
        targetIds: [id],
        scope: vp,
        baseRevision: 0,
        content: nextOverrideContent ?? fallbackContent(nextContent, vp),
      });
    }
    const prevOverrideStyle = prevStyle.overrides?.[vp] ?? {};
    const nextOverrideStyle = nextStyle.overrides?.[vp] ?? {};
    if (!styleEquals(prevOverrideStyle, nextOverrideStyle)) {
      const patch: Record<string, unknown> = {};
      const keys = new Set([...Object.keys(prevOverrideStyle), ...Object.keys(nextOverrideStyle)]);
      for (const key of keys) {
        if (!shallowEqual((prevOverrideStyle as Record<string, unknown>)[key], (nextOverrideStyle as Record<string, unknown>)[key])) {
          patch[key] = (nextOverrideStyle as Record<string, unknown>)[key];
        }
      }
      commands.push({
        kind: 'set-style',
        source,
        targetIds: [id],
        scope: vp,
        baseRevision: 0,
        stylePatch: patch,
      });
    }
  }
}

function fallbackContent(scoped: ScopedContent, vp: string): ElementContent {
  void vp;
  return scoped.base;
}

function contentEquals(a: ElementContent | undefined, b: ElementContent | undefined): boolean {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

function styleEquals(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  const ka = Object.keys(a ?? {}).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b ?? {}).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => shallowEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function shallowEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

function stripTransient(element: TemplateDoc['elements'][string]): TemplateDoc['elements'][string] {
  return JSON.parse(JSON.stringify(element));
}
