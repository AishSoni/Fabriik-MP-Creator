import * as Y from 'yjs';
import type { RevisionEntry } from '../types/commands';
import type {
  ElementContent,
  ElementId,
  ElementType,
  NavContent,
  ScopedContent,
  ScopedStyle,
  StyleProps,
  TemplateDoc,
  TemplateElement,
} from '../types/template';
import type { Viewport } from '../types/viewport';
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

export type NavLink = NavContent['links'][number];
export type StyleLayerValue = StyleProps[keyof StyleProps];
export type ContentLayerValue = string | string[] | NavLink[];
export type LayerValue = StyleLayerValue | ContentLayerValue;

export type YValueLayer<V extends LayerValue> = Y.Map<V>;
export type YScopedLayer<V extends LayerValue> = Y.Map<YValueLayer<V> | Y.Map<YValueLayer<V>>>;

export type YElementField =
  | ElementId
  | ElementType
  | null
  | Y.Array<ElementId>
  | YScopedLayer<ContentLayerValue>
  | YScopedLayer<StyleLayerValue>;

export type YElement = Y.Map<YElementField>;

export type HistoryEntry = Omit<RevisionEntry, 'baseRevision'> & {
  serverSeq?: number;
};

export function getMetaYMap(ydoc: Y.Doc): Y.Map<string> {
  return ydoc.getMap(META_KEY);
}

export function getElementsYMap(ydoc: Y.Doc): Y.Map<YElement> {
  return ydoc.getMap(ELEMENTS_KEY);
}

export function getHistoryYArray(ydoc: Y.Doc): Y.Array<HistoryEntry> {
  return ydoc.getArray(HISTORY_KEY);
}

export function getElementYMap(ydoc: Y.Doc, id: ElementId): YElement | undefined {
  return getElementsYMap(ydoc).get(id);
}

export function readElementId(el: YElement): ElementId {
  return el.get(ID_FIELD) as ElementId;
}

export function readElementType(el: YElement): ElementType {
  return el.get(TYPE_FIELD) as ElementType;
}

export function readParentId(el: YElement): ElementId | null {
  return (el.get(PARENT_ID_FIELD) as ElementId | null) ?? null;
}

export function readChildIdsYArray(el: YElement): Y.Array<ElementId> {
  return el.get(CHILD_IDS_FIELD) as Y.Array<ElementId>;
}

export function readChildIds(el: YElement): ElementId[] {
  return readChildIdsYArray(el).toArray();
}

export function readContentLayer(el: YElement): YScopedLayer<ContentLayerValue> {
  return el.get(CONTENT_FIELD) as YScopedLayer<ContentLayerValue>;
}

export function readStyleLayer(el: YElement): YScopedLayer<StyleLayerValue> {
  return el.get(STYLE_FIELD) as YScopedLayer<StyleLayerValue>;
}

export function readBaseLayer<V extends LayerValue>(scoped: YScopedLayer<V>): YValueLayer<V> {
  return scoped.get(BASE_LAYER) as YValueLayer<V>;
}

export function readOverridesLayers<V extends LayerValue>(
  scoped: YScopedLayer<V>,
): Y.Map<YValueLayer<V>> | undefined {
  return scoped.get(OVERRIDES_LAYER) as Y.Map<YValueLayer<V>> | undefined;
}

function buildScopedLayerYMap<V extends LayerValue>(layers: {
  base: Record<string, V>;
  overrides?: Record<string, Record<string, V>>;
}): YScopedLayer<V> {
  const layer = new Y.Map<YValueLayer<V> | Y.Map<YValueLayer<V>>>();
  const base = new Y.Map<V>();
  for (const [key, value] of Object.entries(layers.base)) {
    base.set(key, value);
  }
  layer.set(BASE_LAYER, base);
  if (layers.overrides) {
    const overrides = new Y.Map<Y.Map<V>>();
    for (const [viewport, values] of Object.entries(layers.overrides)) {
      const scoped = new Y.Map<V>();
      for (const [key, value] of Object.entries(values)) {
        scoped.set(key, value);
      }
      overrides.set(viewport, scoped);
    }
    layer.set(OVERRIDES_LAYER, overrides);
  }
  return layer;
}

export function buildContentYMap(content: ScopedContent): YScopedLayer<ContentLayerValue> {
  return buildScopedLayerYMap<ContentLayerValue>({
    base: content.base as Record<string, ContentLayerValue>,
    overrides: content.overrides as Record<string, Record<string, ContentLayerValue>> | undefined,
  });
}

export function buildStyleYMap(style: ScopedStyle): YScopedLayer<StyleLayerValue> {
  return buildScopedLayerYMap<StyleLayerValue>({
    base: style.base as Record<string, StyleLayerValue>,
    overrides: style.overrides as Record<string, Record<string, StyleLayerValue>> | undefined,
  });
}

export function buildElementYMap(element: TemplateElement): YElement {
  const ymap = new Y.Map<YElementField>();
  ymap.set(ID_FIELD, element.id);
  ymap.set(TYPE_FIELD, element.type);
  ymap.set(PARENT_ID_FIELD, element.parentId);
  ymap.set(CHILD_IDS_FIELD, Y.Array.from<ElementId>(element.childIds));
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

    getHistoryYArray(ydoc);
  }, TRANSACTION_ORIGIN);
}

export interface ScopedLayerJson<V extends LayerValue> {
  base: Record<string, V>;
  overrides?: Record<string, Record<string, V>>;
}

export function projectScopedLayerJson<V extends LayerValue>(
  scoped: YScopedLayer<V>,
): ScopedLayerJson<V> {
  const json: ScopedLayerJson<V> = { base: readBaseLayer(scoped).toJSON() };
  const overridesLayers = readOverridesLayers(scoped);
  if (!overridesLayers || overridesLayers.size === 0) {
    return json;
  }
  const overrides: Record<string, Record<string, V>> = {};
  overridesLayers.forEach((layer, viewport) => {
    overrides[viewport] = layer.toJSON();
  });
  json.overrides = overrides;
  return json;
}

function projectContentLayer(el: YElement): ScopedContent {
  const json = projectScopedLayerJson(readContentLayer(el));
  const base = json.base as ElementContent;
  if (!json.overrides) {
    return { base };
  }
  const overrides: Partial<Record<Viewport, ElementContent>> = {};
  for (const viewport of VIEWPORT_SCOPE_KEYS) {
    const scopedJson = json.overrides[viewport];
    if (scopedJson) {
      overrides[viewport] = scopedJson as ElementContent;
    }
  }
  return { base, overrides };
}

function projectStyleLayer(el: YElement): ScopedStyle {
  const json = projectScopedLayerJson(readStyleLayer(el));
  const base = json.base as StyleProps;
  if (!json.overrides) {
    return { base };
  }
  const overrides: Partial<Record<Viewport, StyleProps>> = {};
  for (const viewport of VIEWPORT_SCOPE_KEYS) {
    const scopedJson = json.overrides[viewport];
    if (scopedJson) {
      overrides[viewport] = scopedJson as StyleProps;
    }
  }
  return { base, overrides };
}

export function projectElement(el: YElement): TemplateElement {
  return {
    id: readElementId(el),
    type: readElementType(el),
    parentId: readParentId(el),
    childIds: readChildIds(el),
    content: projectContentLayer(el),
    style: projectStyleLayer(el),
  };
}

export function projectDoc(ydoc: Y.Doc): TemplateDoc {
  const meta = getMetaYMap(ydoc);
  const elements = getElementsYMap(ydoc);
  const projected: Record<ElementId, TemplateElement> = {};
  elements.forEach((el, id) => {
    projected[id] = projectElement(el);
  });
  return {
    templateId: meta.get(TEMPLATE_ID_FIELD) as string,
    templateName: meta.get(TEMPLATE_NAME_FIELD) as string,
    revision: 0,
    rootId: meta.get(ROOT_ID_FIELD) as ElementId,
    elements: projected,
  };
}
