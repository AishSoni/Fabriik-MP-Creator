import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../template';
import type { TemplateDoc, TemplateElement } from '../types/template';
import type { EditCommand } from '../types/commands';
import { templateDocSchema } from '../engine/validate';
import {
  TEMPLATE_NAME_FIELD,
  TRANSACTION_ORIGIN,
  buildElementYMap,
  getElementsYMap,
  getHistoryYArray,
  getMetaYMap,
  readChildIdsYArray,
} from './schema';
import { applyCommandToYDoc } from './commandAdapter';
import type { ApplyOptions } from './commandAdapter';
import { createTemplateProjector } from './project';

const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const stripRevision = (doc: TemplateDoc) => {
  const { revision: _revision, ...rest } = doc;
  return rest;
};

const firstTemplate = () => {
  const definition = TEMPLATES.at(0);
  if (!definition) throw new Error('no built-in templates defined');
  return definition.create();
};

const firstElementOf = (doc: TemplateDoc): TemplateElement => {
  const [element] = Object.values(doc.elements);
  if (!element) throw new Error('template has no elements');
  return element;
};

describe('project round-trip', () => {
  it.each(TEMPLATES)('$name projects losslessly through a Y.Doc', async (definition) => {
    const original = definition.create();
    const projector = createTemplateProjector();
    projector.hydrate(original);
    const emitted: TemplateDoc[] = [];
    projector.subscribe((doc) => emitted.push(doc));
    await flushMicrotasks();

    const projected = emitted.at(-1);
    if (!projected) throw new Error('projection was not emitted');
    expect(stripRevision(projected)).toEqual(stripRevision(original));
    expect(templateDocSchema.safeParse(projected).success).toBe(true);
    expect(templateDocSchema.safeParse(original).success).toBe(true);
  });
});

describe('orphan tolerance', () => {
  it('materializes parent-first inserts with dangling childIds without throwing', async () => {
    const original = firstTemplate();
    const projector = createTemplateProjector();
    projector.hydrate(original);
    const emitted: TemplateDoc[] = [];
    projector.subscribe((doc) => emitted.push(doc));

    const source = firstElementOf(original);
    const orphanParent: TemplateElement = {
      ...source,
      id: 'orphan-parent',
      parentId: original.rootId,
      childIds: ['ghost-child'],
    };
    const elements = getElementsYMap(projector.ydoc);
    projector.ydoc.transact(() => {
      elements.set(orphanParent.id, buildElementYMap(orphanParent));
      const root = elements.get(original.rootId);
      if (root) {
        readChildIdsYArray(root).push(['ghost-child', 'orphan-parent']);
      }
    }, TRANSACTION_ORIGIN);

    const projected = projector.getProjection();
    expect(projected.elements['orphan-parent']?.childIds).toEqual(['ghost-child']);
    expect(projected.elements['ghost-child']).toBeUndefined();

    await flushMicrotasks();
    expect(emitted.length).toBeGreaterThan(0);
  });
});

describe('projection coalescing', () => {
  it('emits exactly one projection for a synchronous burst of commands', async () => {
    const original = firstTemplate();
    const projector = createTemplateProjector();
    projector.hydrate(original);
    const emitted: TemplateDoc[] = [];
    projector.subscribe((doc) => emitted.push(doc));
    await flushMicrotasks();
    expect(emitted).toHaveLength(1);

    const target = firstElementOf(original);
    const commands: EditCommand[] = [1, 2, 3].map((n) => ({
      kind: 'set-content',
      source: 'canvas',
      targetIds: [target.id],
      scope: 'all',
      baseRevision: 0,
      content: { text: `Burst ${n}` },
    }));
    commands.forEach((command, index) => {
      applyCommandToYDoc(projector.ydoc, command, {
        origin: 'authoritative',
        commandId: `cmd-burst-${index}`,
      });
    });

    expect(emitted).toHaveLength(1);
    await flushMicrotasks();
    expect(emitted).toHaveLength(2);
    const last = emitted.at(-1);
    expect(last?.elements[target.id]?.content.base).toMatchObject({ text: 'Burst 3' });
  });

  it('emits when meta changes', async () => {
    const original = firstTemplate();
    const projector = createTemplateProjector();
    projector.hydrate(original);
    const emitted: TemplateDoc[] = [];
    projector.subscribe((doc) => emitted.push(doc));
    await flushMicrotasks();
    expect(emitted).toHaveLength(1);

    getMetaYMap(projector.ydoc).set(TEMPLATE_NAME_FIELD, 'Renamed');
    await flushMicrotasks();
    expect(emitted).toHaveLength(2);
    expect(emitted.at(-1)?.templateName).toBe('Renamed');
  });

  it('emits when history is appended without element changes', async () => {
    const original = firstTemplate();
    const projector = createTemplateProjector();
    projector.hydrate(original);
    const emitted: TemplateDoc[] = [];
    projector.subscribe((doc) => emitted.push(doc));
    await flushMicrotasks();
    expect(emitted).toHaveLength(1);

    const target = firstElementOf(original);
    const command: EditCommand = {
      kind: 'set-content',
      source: 'canvas',
      targetIds: [target.id],
      scope: 'all',
      content: { text: 'Optimistic text' },
    };
    const optimistic: ApplyOptions = { origin: 'optimistic', commandId: 'cmd-opt-1' };
    const { entries } = applyCommandToYDoc(projector.ydoc, command, optimistic);
    expect(entries.length).toBeGreaterThan(0);

    getHistoryYArray(projector.ydoc).push(entries);
    await flushMicrotasks();
    expect(emitted).toHaveLength(2);
  });
});

describe('projector lifecycle', () => {
  it('stops emitting after unsubscribe and destroy', async () => {
    const original = firstTemplate();
    const projector = createTemplateProjector();
    projector.hydrate(original);
    const emitted: TemplateDoc[] = [];
    const unsubscribe = projector.subscribe((doc) => emitted.push(doc));
    await flushMicrotasks();
    expect(emitted).toHaveLength(1);

    unsubscribe();
    projector.destroy();
    getMetaYMap(projector.ydoc).set(TEMPLATE_NAME_FIELD, 'After destroy');
    await flushMicrotasks();
    expect(emitted).toHaveLength(1);
  });
});
