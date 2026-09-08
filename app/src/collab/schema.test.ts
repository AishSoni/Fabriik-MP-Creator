import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { validateTemplateSemantics } from '../engine/validate';
import type { TemplateDoc, TemplateElement } from '../types/template';
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
} from './schema';

const doc = (): TemplateDoc => createDefaultTemplate();

const ydocOf = (d: TemplateDoc = doc()): Y.Doc => {
  const ydoc = new Y.Doc();
  initializeTemplateYDoc(ydoc, d);
  return ydoc;
};

const bound = (build: () => Y.Map<unknown>): Y.Map<unknown> => {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    ydoc.getMap('tmp').set('e', build());
  });
  return ydoc.getMap('tmp').get('e') as Y.Map<unknown>;
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

    const childIds = ymap.get('childIds');
    expect(childIds).toBeInstanceOf(Y.Array);
    expect((childIds as Y.Array<string>).toArray()).toEqual([]);

    const content = ymap.get('content');
    expect(content).toBeInstanceOf(Y.Map);
    const contentBase = (content as Y.Map<unknown>).get(BASE_LAYER);
    expect(contentBase).toBeInstanceOf(Y.Map);
    expect((contentBase as Y.Map<unknown>).toJSON()).toEqual(source.content.base);
    expect((content as Y.Map<unknown>).get(OVERRIDES_LAYER)).toBeUndefined();

    const style = ymap.get('style');
    expect(style).toBeInstanceOf(Y.Map);
    const styleBase = (style as Y.Map<unknown>).get(BASE_LAYER);
    expect(styleBase).toBeInstanceOf(Y.Map);
    expect((styleBase as Y.Map<unknown>).toJSON()).toEqual(source.style.base);

    const styleOverrides = (style as Y.Map<unknown>).get(OVERRIDES_LAYER);
    expect(styleOverrides).toBeInstanceOf(Y.Map);
    const tablet = (styleOverrides as Y.Map<unknown>).get('tablet');
    expect(tablet).toBeInstanceOf(Y.Map);
    expect((tablet as Y.Map<unknown>).toJSON()).toEqual({ fontSize: 40 });
  });

  it('buildElementYMap returns fresh instances on every call', () => {
    const source = doc().elements['hero-heading'];
    const a = bound(() => buildElementYMap(source));
    const b = bound(() => buildElementYMap(source));
    expect(a).not.toBe(b);
    expect((a.get('content') as Y.Map<unknown>).get(BASE_LAYER)).not.toBe(
      (b.get('content') as Y.Map<unknown>).get(BASE_LAYER),
    );
  });

  it('buildContentYMap omits overrides when absent and keeps empty bases', () => {
    const ymap = bound(() => buildContentYMap({ base: {} }));
    expect((ymap.get(BASE_LAYER) as Y.Map<unknown>).size).toBe(0);
    expect(ymap.get(OVERRIDES_LAYER)).toBeUndefined();
  });

  it('round-trips nested arrays and object arrays inside content', () => {
    const nav = doc().elements['top-nav'];
    const ymap = bound(() => buildElementYMap(nav));
    const base = ((ymap.get('content') as Y.Map<unknown>).get(BASE_LAYER) as Y.Map<unknown>).toJSON();
    expect(base).toEqual(nav.content.base);
  });

  it('writes undefined-valued entries verbatim in style layers', () => {
    const ymap = bound(() => buildStyleYMap({ base: { color: undefined, fontSize: 12 } }));
    const base = ymap.get(BASE_LAYER) as Y.Map<unknown>;
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
    const updates: unknown[] = [];
    let observedOrigin: unknown = null;
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
