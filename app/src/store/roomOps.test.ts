import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { applyCommandToYDoc } from '../collab/commandAdapter';
import type { EditCommand, ReplaceDocCommand } from '../types/commands';

const harness = vi.hoisted(() => ({
  instances: [] as unknown[],
}));

vi.mock('../collab/provider', async () => {
  const { Awareness } = await import('y-protocols/awareness');
  const { applyCommandToYDoc: apply } = await import('../collab/commandAdapter');

  class FakeTemplateRoomProvider {
    readonly ydoc: Y.Doc;
    readonly awareness: InstanceType<typeof Awareness>;
    readonly dispatches: { command: EditCommand; optimistic: boolean }[] = [];
    destroyed = false;
    #handlers = new Map<string, Set<(payload: unknown) => void>>();

    constructor(_host: string, _room: string, ydoc: Y.Doc, _options?: unknown) {
      this.ydoc = ydoc;
      this.awareness = new Awareness(ydoc);
      harness.instances.push(this);
    }

    on(name: string, handler: (payload: unknown) => void): void {
      let set = this.#handlers.get(name);
      if (!set) {
        set = new Set();
        this.#handlers.set(name, set);
      }
      set.add(handler);
    }

    off(name: string, handler: (payload: unknown) => void): void {
      this.#handlers.get(name)?.delete(handler);
    }

    dispatch(command: EditCommand, options: { optimistic?: boolean } = {}): string {
      const optimistic = options.optimistic !== false;
      this.dispatches.push({ command, optimistic });
      const commandId = `fake-${this.dispatches.length}`;
      if (optimistic) {
        apply(this.ydoc, command, { origin: 'room-optimistic', commandId });
      }
      return commandId;
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  return { TemplateRoomProvider: FakeTemplateRoomProvider };
});

import {
  attachRoomProvider,
  detachRoomProvider,
  resetYdocPipeline,
  useTemplateStore,
} from './templateStore';

interface FakeProvider {
  ydoc: Y.Doc;
  dispatches: { command: EditCommand; optimistic: boolean }[];
  destroyed: boolean;
}

const state = () => useTemplateStore.getState();

const fakeProvider = (): FakeProvider =>
  harness.instances[harness.instances.length - 1] as FakeProvider;

const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const importedDoc = () => {
  const imported = createDefaultTemplate();
  imported.templateId = 'tpl-imported-x1';
  imported.templateName = 'Imported X';
  return imported;
};

beforeEach(() => {
  localStorage.clear();
  detachRoomProvider();
  resetYdocPipeline();
  harness.instances.length = 0;
  state().loadTemplate('tpl-landing-v1');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  attachRoomProvider('127.0.0.1:8787', 'room-test', { role: 'create' });
});

afterEach(() => {
  detachRoomProvider();
  vi.restoreAllMocks();
});

describe('room-scoped whole-doc operations', () => {
  it('routes importDoc through the room with a confirm and no local apply', () => {
    const before = state().doc;
    const result = state().importDoc(importedDoc());

    expect(result).toBeNull();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    const provider = fakeProvider();
    expect(provider.dispatches).toHaveLength(1);
    expect(provider.dispatches[0].optimistic).toBe(false);
    expect(provider.dispatches[0].command).toMatchObject({
      kind: 'replace-doc',
      reason: 'import',
    });
    expect((provider.dispatches[0].command as ReplaceDocCommand).doc.templateId).toBe(
      'tpl-imported-x1',
    );
    expect(state().doc).toBe(before);
    expect(state().activeTemplateId).toBe('tpl-landing-v1');
  });

  it('leaves everything untouched when the room replace is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const result = state().importDoc(importedDoc());

    expect(result).toBeNull();
    expect(fakeProvider().dispatches).toHaveLength(0);
    expect(state().doc.templateId).toBe('tpl-landing-v1');
    expect(state().activeTemplateId).toBe('tpl-landing-v1');
  });

  it('adopts the replaced doc once the server applies it authoritatively', async () => {
    state().dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Edited before replace' },
    });
    expect(state().past).toHaveLength(1);

    state().importDoc(importedDoc());
    const provider = fakeProvider();
    const call = provider.dispatches.find((entry) => entry.command.kind === 'replace-doc');
    expect(call).toBeDefined();
    applyCommandToYDoc(provider.ydoc, call!.command, {
      origin: 'authoritative',
      commandId: 'srv-1',
      serverSeq: 1,
    });
    await flushMicrotasks();

    const after = state();
    expect(after.doc.templateId).toBe('tpl-imported-x1');
    expect(after.activeTemplateId).toBe('tpl-imported-x1');
    expect(after.past).toHaveLength(0);
    expect(after.future).toHaveLength(0);
    expect(after.history).toEqual({});
  });

  it('routes loadTemplate and resetDoc as room replaces', () => {
    state().loadTemplate('tpl-portfolio-v1');
    const provider = fakeProvider();
    const load = provider.dispatches.at(-1);
    expect(load).toMatchObject({
      optimistic: false,
      command: { kind: 'replace-doc', reason: 'load-template' },
    });
    expect((load!.command as ReplaceDocCommand).doc.templateId).toBe('tpl-portfolio-v1');

    state().resetDoc();
    const reset = provider.dispatches.at(-1);
    expect(reset).toMatchObject({
      optimistic: false,
      command: { kind: 'replace-doc', reason: 'reset' },
    });
  });
});

describe('room-scoped renames', () => {
  it('sends a name-only code rename as an optimistic rename command', async () => {
    const candidate = JSON.parse(JSON.stringify(state().doc)) as Record<string, unknown>;
    candidate.templateName = 'Room Renamed';

    const result = state().replaceDoc(candidate);

    expect(result).toEqual([]);
    expect(window.confirm).not.toHaveBeenCalled();
    const provider = fakeProvider();
    expect(provider.dispatches).toHaveLength(1);
    expect(provider.dispatches[0]).toMatchObject({
      optimistic: true,
      command: { kind: 'rename', templateName: 'Room Renamed', source: 'code' },
    });
    await flushMicrotasks();
    expect(state().doc.templateName).toBe('Room Renamed');
  });

  it('dispatches element diffs then the rename when both change', () => {
    const candidate = JSON.parse(JSON.stringify(state().doc)) as {
      templateName: string;
      elements: Record<string, { content: { base: { text: string } } }>;
    };
    candidate.templateName = 'Both Changed';
    candidate.elements['hero-heading'].content.base.text = 'Coded headline';

    state().replaceDoc(candidate);

    const kinds = fakeProvider().dispatches.map((entry) => entry.command.kind);
    expect(kinds).toEqual(['set-content', 'rename']);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
