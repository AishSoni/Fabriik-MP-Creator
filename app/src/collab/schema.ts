import * as Y from 'yjs';
import type {
  ElementId,
  ScopedContent,
  ScopedStyle,
  TemplateDoc,
  TemplateElement,
} from '../types/template';
import { VIEWPORTS } from '../types/viewport';

export const META_KEY = 'meta';
export const ELEMENTS_KEY = 'elements';
export const HISTORY_KEY = 'history';

export const ID_FIELD = 'id';
export const TYPE_FIELD = 'type';
export const PARENT_ID_FIELD = 'parentId';
export const CHILD_IDS_FIELD = 'childIds';
export const CONTENT_FIELD = 'content';
export const STYLE_FIELD = 'style';

export const TEMPLATE_ID_FIELD = 'templateId';
export const TEMPLATE_NAME_FIELD = 'templateName';
export const ROOT_ID_FIELD = 'rootId';

export const BASE_LAYER = 'base';
export const OVERRIDES_LAYER = 'overrides';

export const TRANSACTION_ORIGIN = 'command-adapter';

export const META_FIELDS = [TEMPLATE_ID_FIELD, TEMPLATE_NAME_FIELD, ROOT_ID_FIELD] as const;

export const VIEWPORT_SCOPE_KEYS = VIEWPORTS;

export function getMetaYMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(META_KEY);
}

export function getElementsYMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap(ELEMENTS_KEY);
}

export function getHistoryYArray(ydoc: Y.Doc): Y.Array<unknown> {
  return ydoc.getArray(HISTORY_KEY);
}

export function getElementYMap(ydoc: Y.Doc, id: ElementId): Y.Map<unknown> | undefined {
  return getElementsYMap(ydoc).get(id);
}

function buildScopedLayerYMap(layers: {
  base: object;
  overrides?: object;
}): Y.Map<unknown> {
  const layer = new Y.Map<unknown>();
  const base = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(layers.base)) {
    base.set(key, value);
  }
  layer.set(BASE_LAYER, base);
  if (layers.overrides) {
    const overrides = new Y.Map<Y.Map<unknown>>();
    for (const [viewport, values] of Object.entries(layers.overrides)) {
      const scoped = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(values as object)) {
        scoped.set(key, value);
      }
      overrides.set(viewport, scoped);
    }
    layer.set(OVERRIDES_LAYER, overrides);
  }
  return layer;
}

export function buildContentYMap(content: ScopedContent): Y.Map<unknown> {
  return buildScopedLayerYMap(content);
}

export function buildStyleYMap(style: ScopedStyle): Y.Map<unknown> {
  return buildScopedLayerYMap(style);
}

export function buildElementYMap(element: TemplateElement): Y.Map<unknown> {
  const ymap = new Y.Map<unknown>();
  ymap.set(ID_FIELD, element.id);
  ymap.set(TYPE_FIELD, element.type);
  ymap.set(PARENT_ID_FIELD, element.parentId);
  ymap.set(CHILD_IDS_FIELD, Y.Array.from(element.childIds));
  ymap.set(CONTENT_FIELD, buildContentYMap(element.content));
  ymap.set(STYLE_FIELD, buildStyleYMap(element.style));
  return ymap;
}

export interface TemplateMeta {
  templateId: string;
  templateName: string;
  rootId: ElementId;
}

export function initializeTemplateYDoc(ydoc: Y.Doc, doc: TemplateDoc): void {
  ydoc.transact(() => {
    const meta = getMetaYMap(ydoc);
    meta.set(TEMPLATE_ID_FIELD, doc.templateId);
    meta.set(TEMPLATE_NAME_FIELD, doc.templateName);
    meta.set(ROOT_ID_FIELD, doc.rootId);

    const elements = getElementsYMap(ydoc);
    for (const element of Object.values(doc.elements)) {
      elements.set(element.id, buildElementYMap(element));
    }
  }, TRANSACTION_ORIGIN);
}

interface ScopedLayerProjection {
  base: Record<string, unknown>;
  overrides?: Record<string, Record<string, unknown>>;
}

function projectScopedLayer(raw: unknown): ScopedLayerProjection {
  const layer = raw as Y.Map<unknown>;
  const baseMap = layer.get(BASE_LAYER) as Y.Map<unknown>;
  const base = baseMap.toJSON() as Record<string, unknown>;
  const overridesMap = layer.get(OVERRIDES_LAYER) as Y.Map<Y.Map<unknown>> | undefined;
  if (!overridesMap || overridesMap.size === 0) {
    return { base };
  }
  const overrides: Record<string, Record<string, unknown>> = {};
  overridesMap.forEach((scoped, viewport) => {
    overrides[viewport] = scoped.toJSON() as Record<string, unknown>;
  });
  return { base, overrides };
}

export function projectElement(ymap: Y.Map<unknown>): TemplateElement {
  const childIds = ymap.get(CHILD_IDS_FIELD) as Y.Array<ElementId>;
  return {
    id: ymap.get(ID_FIELD) as ElementId,
    type: ymap.get(TYPE_FIELD) as TemplateElement['type'],
    parentId: (ymap.get(PARENT_ID_FIELD) as ElementId | null | undefined) ?? null,
    childIds: childIds.toArray(),
    content: projectScopedLayer(ymap.get(CONTENT_FIELD)) as unknown as ScopedContent,
    style: projectScopedLayer(ymap.get(STYLE_FIELD)) as unknown as ScopedStyle,
  };
}

export function projectDoc(ydoc: Y.Doc): TemplateDoc {
  const meta = getMetaYMap(ydoc);
  const elements = getElementsYMap(ydoc);
  const projected: Record<ElementId, TemplateElement> = {};
  elements.forEach((ymap, id) => {
    projected[id] = projectElement(ymap);
  });
  return {
    templateId: meta.get(TEMPLATE_ID_FIELD) as string,
    templateName: meta.get(TEMPLATE_NAME_FIELD) as string,
    revision: 0,
    rootId: meta.get(ROOT_ID_FIELD) as ElementId,
    elements: projected,
  };
}
