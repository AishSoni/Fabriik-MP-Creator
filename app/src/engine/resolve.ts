import type {
  ElementContent,
  ElementId,
  StyleProps,
  TemplateDoc,
  TemplateElement,
} from '../types/template';
import type { Viewport } from '../types/viewport';

export interface ResolvedElement {
  id: ElementId;
  type: TemplateElement['type'];
  parentId: ElementId | null;
  childIds: ElementId[];
  content: ElementContent;
  style: StyleProps;
}

export function resolveElement(
  element: TemplateElement,
  viewport: Viewport,
): ResolvedElement {
  const contentOverride = element.content.overrides?.[viewport];
  const styleOverride = element.style.overrides?.[viewport];
  return {
    id: element.id,
    type: element.type,
    parentId: element.parentId,
    childIds: element.childIds,
    content: { ...element.content.base, ...contentOverride },
    style: { ...element.style.base, ...styleOverride },
  };
}

export function resolveTree(
  doc: TemplateDoc,
  viewport: Viewport,
): Map<ElementId, ResolvedElement> {
  const map = new Map<ElementId, ResolvedElement>();
  for (const element of Object.values(doc.elements)) {
    map.set(element.id, resolveElement(element, viewport));
  }
  return map;
}

export function getSubtreeIds(doc: TemplateDoc, rootId: ElementId): ElementId[] {
  const ids: ElementId[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const element = doc.elements[current];
    if (!element) continue;
    ids.push(current);
    for (let i = element.childIds.length - 1; i >= 0; i--) {
      stack.push(element.childIds[i]);
    }
  }
  return ids;
}
