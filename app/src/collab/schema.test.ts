import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { validateTemplateSemantics } from '../engine/validate';
import type { TemplateDoc, TemplateElement } from '../types/template';
import type { CollabRevisionEntry } from './commandAdapter';
import {
  BASE_LAYER,
  ELEMENTS_KEY,
  HISTORY_KEY,
  META_KEY,
  OVERRIDES_LAYER,
  TRANSACTION_ORIGIN,
  buildContentYMap,
  buildElementYMap,
  buildStyleYMap,
  getElementYMap,
  getElementsYMap,
  getHistoryYArray,
  getMetaYMap,
  initializeTemplateYDoc,
  projectDoc,
  readBaseLayer,
  readChildIds,
  readChildIdsYArray,
  readContentLayer,
  readOverridesLayers,
  readStyleLayer,
} from './schema';

const doc = (): TemplateDoc => createDefaultTemplate();

const ydocOf = (d: TemplateDoc = doc()): Y.Doc => {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, d);
  return ydoc;
};

const bound = <T>(build: () => T): T => {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    ydoc.getMap('tmp').set('e', build());
  });
  return ydoc.getMap('tmp').get('e') as T;
};

describe('schema constants', () => {
  it('exposes the canonical Y.Doc paths and origin tag', () => {
    expect(META_KEY).toBe('meta');
    expect(ELEMENTS_KEY).toBe('elements');
    expect(HISTORY_KEY).toBe('history');
    expect(BASE_LAYER).toBe('base');
    expect(OVERRIDES_LAYER).toBe('overrides');
    expect(TRANSACTION_ORIGIN).toBe('command-adapter');
  });
});

describe('builders', () => {
  it('buildElementYMap stores plain fields, a Y.Array for childIds, and nested layer maps', () => {
    const source: TemplateElement = doc().elements['hero-heading'];
    const ymap = bound(() => buildElementYMap(source));

    expect(ymap.get('id')).toBe('hero-heading');
    expect(ymap.get('type')).toBe('heading');
    expect(ymap.get('parentId')).toBe('hero-section');

    expect(readChildIdsYArray(ymap)).toBeInstanceOf(Y.Array);
    expect(readChildIds(ymap)).toEqual([]);

    const content = readContentLayer(ymap);
    expect(content).toBeInstanceOf(Y.Map);
    const contentBase = readBaseLayer(content);
    expect(contentBase).toBeInstanceOf(Y.Map);
    expect(contentBase.toJSON()).toEqual(source.content.base);
    expect(readOverridesLayers(content)).toBeUndefined();

    const style = readStyleLayer(ymap);
    expect(style).toBeInstanceOf(Y.Map);
    const styleBase = readBaseLayer(style);
    expect(styleBase).toBeInstanceOf(Y.Map);
    expect(styleBase.toJSON()).toEqual(source.style.base);

    const styleOverrides = readOverridesLayers(style);
    expect(styleOverrides).toBeInstanceOf(Y.Map);
    const tablet = styleOverrides?.get('tablet');
    expect(tablet).toBeInstanceOf(Y.Map);
    expect(tablet?.toJSON()).toEqual({ fontSize: 40 });
  });

  it('buildElementYMap returns fresh instances on every call', () => {
    const source = doc().elements['hero-heading'];
    const a = bound(() => buildElementYMap(source));
    const b = bound(() => buildElementYMap(source));
    expect(a).not.toBe(b);
    expect(readBaseLayer(readContentLayer(a))).not.toBe(readBaseLayer(readContentLayer(b)));
  });

  it('buildContentYMap omits overrides when absent and keeps empty bases', () => {
    const ymap = bound(() => buildContentYMap({ base: {} }));
    expect(readBaseLayer(ymap).size).toBe(0);
    expect(readOverridesLayers(ymap)).toBeUndefined();
  });

  it('round-trips nested arrays and object arrays inside content', () => {
    const nav = doc().elements['top-nav'];
    const ymap = bound(() => buildElementYMap(nav));
    const base = readBaseLayer(readContentLayer(ymap)).toJSON();
    expect(base).toEqual(nav.content.base);
  });

  it('writes undefined-valued entries verbatim in style layers', () => {
    const ymap = bound(() => buildStyleYMap({ base: { color: undefined, fontSize: 12 } }));
    const base = readBaseLayer(ymap);
    expect(base.has('color')).toBe(true);
    expect(base.get('color')).toBeUndefined();
    expect(base.get('fontSize')).toBe(12);
  });
});

describe('initializeTemplateYDoc', () => {
  it('sets meta, rebuilds elements, and leaves history empty', () => {
    const ydoc = ydocOf();
    const meta = getMetaYMap(ydoc);
    expect(meta.get('templateId')).toBe('tpl-landing-v1');
    expect(meta.get('templateName')).toBe('Landing Page');
    expect(meta.get('rootId')).toBe('page-root');
    expect(getElementsYMap(ydoc).size).toBe(Object.keys(doc().elements).length);
    expect(getHistoryYArray(ydoc).length).toBe(0);
  });

  it('removes element keys that are absent from the replacement doc', () => {
    const ydoc = ydocOf();
    const staleId = 'hero-heading';
    const replacement = doc();
    delete replacement.elements[staleId];

    initializeTemplateYDoc(ydoc, replacement);

    const elements = getElementsYMap(ydoc);
    expect(elements.has(staleId)).toBe(false);
    expect(elements.size).toBe(Object.keys(replacement.elements).length);
    expect(projectDoc(ydoc).elements[staleId]).toBeUndefined();
  });

  it('preserves existing history entries when rebuilding elements', () => {
    const ydoc = ydocOf();
    const history = getHistoryYArray(ydoc);
    history.push([{ elementId: 'hero-heading' } as CollabRevisionEntry]);

    initializeTemplateYDoc(ydoc, doc());

    expect(getHistoryYArray(ydoc).length).toBe(1);
    expect(getHistoryYArray(ydoc).get(0)?.elementId).toBe('hero-heading');
  });

  it('projects back to a deep-equal TemplateDoc (revision normalized)', () => {
    const source = doc();
    const projected = projectDoc(ydocOf(source));
    const { revision: _sourceRevision, ...sourceRest } = source;
    const { revision: _projectedRevision, ...projectedRest } = projected;
    expect(projectedRest).toEqual(sourceRest);
    expect(projected.revision).toBe(0);
  });

  it('produces a semantically valid doc', () => {
    expect(validateTemplateSemantics(projectDoc(ydocOf()))).toEqual([]);
  });

  it('runs inside a single transaction tagged with the adapter origin', () => {
    const ydoc = new Y.Doc();
    const updates: Uint8Array[] = [];
    let observedOrigin: string | undefined;
    ydoc.on('update', (update: Uint8Array) => updates.push(update));
    ydoc.on('afterTransaction', (transaction: Y.Transaction) => {
      observedOrigin = transaction.origin;
    });
    initializeTemplateYDoc(ydoc, doc());
    expect(updates).toHaveLength(1);
    expect(observedOrigin).toBe(TRANSACTION_ORIGIN);
  });
});

describe('accessors', () => {
  it('resolve top-level types and individual elements', () => {
    const ydoc = ydocOf();
    expect(getElementsYMap(ydoc).get('page-root')).toBeInstanceOf(Y.Map);
    expect(getElementYMap(ydoc, 'hero-heading')).toBeInstanceOf(Y.Map);
    expect(getElementYMap(ydoc, 'missing')).toBeUndefined();
  });
});
