import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { getTemplateById } from '../template';
import { getHistoryYArray, projectDoc } from './schema';
import { applyCommandToYDoc } from './commandAdapter';
import type { CollabRevisionEntry } from './commandAdapter';
import { TemplateRoomProvider } from './provider';
import {
  DEFAULT_YDOC_DB_NAME,
  bindTemplatePersistence,
  seedTemplateYdoc,
} from './persistence';
import {
  getTemplateYdoc,
  resetYdocPipeline,
  useTemplateStore,
  whenTemplatePersistenceReady,
} from '../store/templateStore';
import type { TemplateDoc } from '../types/template';

const state = () => useTemplateStore.getState();

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let dbNameCounter = 0;
const freshName = (): string => `persistence-test-${++dbNameCounter}`;

const landing = (): TemplateDoc => {
  const definition = getTemplateById('tpl-landing-v1');
  if (!definition) throw new Error('landing template missing');
  return definition.create();
};

const editorial = (): TemplateDoc => createDefaultTemplate();

const legacyKey = 'fabriik-template-v1';

const writeLegacyKey = (doc: TemplateDoc): void => {
  localStorage.setItem(
    legacyKey,
    JSON.stringify({
      state: {
        doc,
        history: {},
        past: [],
        future: [],
        activeTemplateId: doc.templateId,
      },
      version: 4,
    }),
  );
};

const styleHeroHeading = async (ydoc: Y.Doc, color: string): Promise<void> => {
  applyCommandToYDoc(
    ydoc,
    {
      kind: 'set-style',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      stylePatch: { color },
    },
    { origin: 'authoritative', commandId: 'cmd-persist-1' },
  );
  await flush();
};

const historyOf = (ydoc: Y.Doc): CollabRevisionEntry[] =>
  getHistoryYArray(ydoc).toJSON() as CollabRevisionEntry[];

const deleteDb = async (name: string): Promise<void> => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};

beforeEach(() => {
  localStorage.clear();
});

describe('bindTemplatePersistence', () => {
  it('seeds an empty database, persists it, and adopts the stored session over a later seed', async () => {
    const name = freshName();

    const ydocA = new Y.Doc();
    const boundA = bindTemplatePersistence(ydocA, name, { seedDoc: editorial });
    seedTemplateYdoc(ydocA, landing());
    await boundA.ready;
    expect(projectDoc(ydocA)).toEqual(landing());
    await styleHeroHeading(ydocA, '#101010');
    expect(historyOf(ydocA)).toHaveLength(1);

    const ydocB = new Y.Doc();
    const boundB = bindTemplatePersistence(ydocB, name, { seedDoc: editorial });
    seedTemplateYdoc(ydocB, editorial());
    await boundB.ready;

    expect(projectDoc(ydocB)).toEqual(projectDoc(ydocA));
    expect(projectDoc(ydocB).elements['hero-heading'].style.base.color).toBe('#101010');
    expect(historyOf(ydocB)).toHaveLength(1);
  });

  it('migrates a legacy localStorage doc into an empty database and removes the key', async () => {
    const name = freshName();
    const legacyDoc = { ...landing(), templateName: 'Legacy Saved' };
    writeLegacyKey(legacyDoc);

    const ydoc = new Y.Doc();
    const bound = bindTemplatePersistence(ydoc, name, {
      seedDoc: editorial,
      migrateLegacy: true,
    });
    seedTemplateYdoc(ydoc, editorial());
    await bound.ready;

    expect(projectDoc(ydoc)).toEqual(legacyDoc);
    expect(projectDoc(ydoc).templateName).toBe('Legacy Saved');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('ignores an unparsable legacy key, seeds the fallback, and removes the key', async () => {
    const name = freshName();
    localStorage.setItem(legacyKey, 'not-json-at-all');

    const ydoc = new Y.Doc();
    const bound = bindTemplatePersistence(ydoc, name, {
      seedDoc: editorial,
      migrateLegacy: true,
    });
    seedTemplateYdoc(ydoc, editorial());
    await bound.ready;

    expect(projectDoc(ydoc)).toEqual(editorial());
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('prefers the stored session over a stale legacy key and cleans the key up', async () => {
    const name = freshName();
    writeLegacyKey(editorial());

    const ydocA = new Y.Doc();
    const boundA = bindTemplatePersistence(ydocA, name, { seedDoc: editorial });
    seedTemplateYdoc(ydocA, landing());
    await boundA.ready;
    await styleHeroHeading(ydocA, '#202020');

    const ydocB = new Y.Doc();
    const boundB = bindTemplatePersistence(ydocB, name, {
      seedDoc: editorial,
      migrateLegacy: true,
    });
    seedTemplateYdoc(ydocB, editorial());
    await boundB.ready;

    expect(projectDoc(ydocB).elements['hero-heading'].style.base.color).toBe('#202020');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });
});

describe('template store persistence wiring', () => {
  beforeEach(async () => {
    resetYdocPipeline();
    await deleteDb(DEFAULT_YDOC_DB_NAME);
  });

  it('persists dispatches and rehydrates them into a fresh projector', async () => {
    state().loadTemplate('tpl-landing-v1');
    state().dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Persisted headline' },
    });

    await whenTemplatePersistenceReady();
    await flush();

    resetYdocPipeline();
    state().loadTemplate('tpl-editorial-v1');
    getTemplateYdoc();
    await whenTemplatePersistenceReady();
    await flush();

    const text = (state().doc.elements['hero-heading'].content.base as { text: string }).text;
    expect(text).toBe('Persisted headline');
    const total = Object.values(state().history).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(1);
  });

  it('serves the seed synchronously without waiting for persistence', async () => {
    state().loadTemplate('tpl-landing-v1');

    const firstPaint = state().doc;
    expect(firstPaint.templateId).toBe('tpl-landing-v1');
    expect(firstPaint.elements['hero-heading']).toBeDefined();

    let settled = false;
    const ready = whenTemplatePersistenceReady().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);

    await ready;
    await flush();
    expect(state().doc.elements['hero-heading']).toBeDefined();
  });

  it('keeps an offline edit across a reload and uploads it when a room reconnects', async () => {
    state().loadTemplate('tpl-landing-v1');
    state().dispatch({
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      content: { text: 'Offline headline' },
    });
    await whenTemplatePersistenceReady();
    await flush();

    resetYdocPipeline();
    state().loadTemplate('tpl-editorial-v1');
    const ydoc = getTemplateYdoc();

    expect(state().doc.templateId).toBe('tpl-editorial-v1');
    await whenTemplatePersistenceReady();
    await flush();
    expect(state().doc.templateId).toBe('tpl-landing-v1');

    const provider = new TemplateRoomProvider('127.0.0.1:8787', 'persist-room', ydoc, {
      connect: false,
      uploadLocal: true,
    });
    const sent: Uint8Array[] = [];
    provider.ws = {
      send: (bytes: ArrayBuffer) => {
        sent.push(new Uint8Array(bytes));
      },
      close: () => undefined,
    } as unknown as WebSocket;
    provider.wsconnected = true;
    provider.synced = true;

    expect(sent).toHaveLength(1);
    const server = new Y.Doc();
    syncProtocol.readSyncMessage(
      decoding.createDecoder(sent[0].subarray(1)),
      encoding.createEncoder(),
      server,
      'test-server',
    );
    const uploaded = (projectDoc(server).elements['hero-heading'].content.base as { text: string })
      .text;
    expect(uploaded).toBe('Offline headline');
    provider.destroy();
  });
});
