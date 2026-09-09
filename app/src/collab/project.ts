import * as Y from 'yjs';
import type { TemplateDoc } from '../types/template';
import {
  getElementsYMap,
  getHistoryYArray,
  getMetaYMap,
  initializeTemplateYDoc,
  projectDoc,
} from './schema';

export type ProjectionListener = (doc: TemplateDoc) => void;

export interface TemplateProjector {
  readonly ydoc: Y.Doc;
  hydrate(doc: TemplateDoc): void;
  getProjection(): TemplateDoc;
  subscribe(listener: ProjectionListener): () => void;
  destroy(): void;
}

export function createTemplateProjector(ydoc: Y.Doc = new Y.Doc()): TemplateProjector {
  const listeners = new Set<ProjectionListener>();
  let pending = false;
  let destroyed = false;

  const flush = (): void => {
    pending = false;
    if (destroyed) return;
    const projection = projectDoc(ydoc);
    for (const listener of listeners) {
      listener(projection);
    }
  };

  const schedule = (): void => {
    if (pending || destroyed) return;
    pending = true;
    queueMicrotask(flush);
  };

  const meta = getMetaYMap(ydoc);
  const elements = getElementsYMap(ydoc);
  const history = getHistoryYArray(ydoc);
  meta.observeDeep(schedule);
  elements.observeDeep(schedule);
  history.observeDeep(schedule);

  return {
    ydoc,
    hydrate(doc) {
      initializeTemplateYDoc(ydoc, doc);
    },
    getProjection() {
      return projectDoc(ydoc);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      meta.unobserveDeep(schedule);
      elements.unobserveDeep(schedule);
      history.unobserveDeep(schedule);
    },
  };
}
