import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';

const providerState = vi.hoisted(() => ({
  calls: 0,
  liveMode: 'resolve' as 'resolve' | 'never',
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    whenSynced: Promise<void>;
    destroy = vi.fn(async () => {});

    constructor() {
      providerState.calls += 1;
      const isProbe = providerState.calls % 2 === 1;
      this.whenSynced =
        !isProbe && providerState.liveMode === 'never'
          ? new Promise<void>(() => {})
          : Promise.resolve();
    }
  },
}));

import { bindTemplatePersistence } from './persistence';

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  providerState.calls = 0;
  providerState.liveMode = 'resolve';
});

describe('bindTemplatePersistence ready race', () => {
  it('resolves ready after the live provider syncs', async () => {
    const ydoc = new Y.Doc();
    const bound = bindTemplatePersistence(ydoc, 'race-resolve', {
      seedDoc: createDefaultTemplate,
    });

    await expect(bound.ready).resolves.toBeUndefined();
  });

  it('settles ready when the doc is destroyed before the live provider syncs', async () => {
    providerState.liveMode = 'never';
    const ydoc = new Y.Doc();
    const bound = bindTemplatePersistence(ydoc, 'race-destroy', {
      seedDoc: createDefaultTemplate,
    });

    await flush();
    ydoc.destroy();

    await expect(bound.ready).rejects.toThrow(/destroyed/);
  });
});
