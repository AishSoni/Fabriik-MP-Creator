import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { z } from 'zod';
import {
  TEMPLATE_ID_FIELD,
  getMetaYMap,
  initializeTemplateYDoc,
  projectDoc,
} from './schema';
import { replaceYDoc } from './commandAdapter';
import { normalizeTemplateDoc, templateDocSchema } from '../engine/validate';
import type { TemplateDoc } from '../types/template';

export const DEFAULT_YDOC_DB_NAME = 'fabriik-template-ydoc-v1';
const LEGACY_STORAGE_KEY = 'fabriik-template-v1';

const SEED_ORIGIN = { kind: 'seed-template' };

export interface BindPersistenceOptions {
  seedDoc: () => TemplateDoc;
  migrateLegacy?: boolean;
  storeTimeout?: number;
}

export interface BoundPersistence {
  ready: Promise<void>;
}

export function seedTemplateYdoc(ydoc: Y.Doc, doc: TemplateDoc): void {
  ydoc.transact(() => {
    initializeTemplateYDoc(ydoc, doc);
  }, SEED_ORIGIN);
}

/**
 * Binds a Y.Doc to IndexedDB without letting the stored session and the
 * local seed race each other.
 *
 * Why two phases: y-indexeddb replays stored updates into the live doc as
 * concurrent writes against whatever the seed already put there. Yjs
 * resolves concurrent map-key writes at integration time by tombstoning
 * the loser (Item.integrate) — so if the seed's clientID happens to be
 * higher, the stored session is destroyed the instant it loads, and no
 * amount of UndoManager tuning can bring it back.
 *
 * Instead we (1) materialize the stored session in a throwaway probe doc,
 * (2) atomically adopt it into the still-pristine live doc via replaceYDoc,
 * and only then (3) attach the live provider. When the provider replays the
 * stored updates in phase 3, both sides carry identical content, so the
 * CRDT merge is deterministic regardless of clientID ordering.
 *
 * History note: replaceYDoc clears the history array, but at swap time it
 * is still empty (the sync seed pushes no entries). The stored session's
 * history entries arrive via the phase-3 update replay and integrate
 * cleanly. Do NOT copy the probe's history into the live doc — that would
 * duplicate the entries the replay already carries.
 */
export function bindTemplatePersistence(
  ydoc: Y.Doc,
  docName: string = DEFAULT_YDOC_DB_NAME,
  options: BindPersistenceOptions,
): BoundPersistence {
  if (typeof indexedDB === 'undefined') {
    return { ready: Promise.resolve() };
  }

  const readLegacyPersistedDoc = (): TemplateDoc | undefined => {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return undefined;
    let envelopeJson: unknown;
    try {
      envelopeJson = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const envelope = z
      .object({ state: z.object({ doc: templateDocSchema }) })
      .safeParse(envelopeJson);
    if (!envelope.success) return undefined;
    return normalizeTemplateDoc(envelope.data.state.doc);
  };

  // Phase 1: probe the stored session in isolation.
  const probe = new Y.Doc();
  const probeProvider = new IndexeddbPersistence(docName, probe);

  // If the live doc is torn down mid-probe (e.g. resetYdocPipeline), take
  // the probe down with it so no IDB connection leaks, and reject `ready`
  // fail-fast: upstream, whenSynced never settles for a destroyed provider,
  // and a forever-pending promise would outlive the pipeline it belongs to.
  let rejectOnDestroy!: (reason: Error) => void;
  const destroyed = new Promise<never>((_resolve, reject) => {
    rejectOnDestroy = reject;
  });
  const onLiveDestroy = (): void => {
    void probeProvider.destroy();
    probe.destroy();
    rejectOnDestroy(
      new Error('ydoc destroyed before persistence adoption completed'),
    );
  };
  ydoc.on('destroy', onLiveDestroy);

  const ready = Promise.race([probeProvider.whenSynced, destroyed])
    .then(() => {
      // Phase 2: decide the live doc's adopted state — one atomic write.
      const storedTemplateId = getMetaYMap(probe).get(TEMPLATE_ID_FIELD);
      if (storedTemplateId !== undefined) {
        // Stored session wins over any seed the caller wrote synchronously.
        replaceYDoc(ydoc, projectDoc(probe));
      } else {
        // Empty database: one-time legacy migration, else keep/write a seed.
        const legacy =
          options.migrateLegacy === true
            ? readLegacyPersistedDoc()
            : undefined;
        if (legacy !== undefined) {
          replaceYDoc(ydoc, legacy);
        } else if (getMetaYMap(ydoc).get(TEMPLATE_ID_FIELD) === undefined) {
          // Caller never sync-seeded — fall back to the provided seed.
          initializeTemplateYDoc(ydoc, options.seedDoc());
        }
        // Otherwise: keep the caller's sync seed as-is (DLD §14 — first
        // paint already rendered from it; don't overwrite with a stale
        // options.seedDoc snapshot).
      }
      if (options.migrateLegacy) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    })
    .finally(() => {
      // Idempotent even if onLiveDestroy already tore the probe down.
      ydoc.off('destroy', onLiveDestroy);
      void probeProvider.destroy();
      probe.destroy();
    })
    .then(() => {
      // Phase 3: attach the live provider only now. Its initial
      // full-state store persists the adopted doc; the stored updates it
      // replays back are content-identical to it, so the merge is safe.
      if (ydoc.isDestroyed) return;
      const provider = new IndexeddbPersistence(docName, ydoc);
      if (options.storeTimeout !== undefined) {
        Object.assign(provider, { _storeTimeout: options.storeTimeout });
      }
      // Upstream whenSynced never settles for a provider destroyed before
      // its first sync, so race it against the live doc's teardown — callers
      // awaiting `ready` must never be left hanging.
      let rejectOnDestroy!: (reason: Error) => void;
      const destroyed = new Promise<never>((_resolve, reject) => {
        rejectOnDestroy = reject;
      });
      const onLiveDestroy = (): void => {
        rejectOnDestroy(
          new Error('ydoc destroyed before provider sync completed'),
        );
      };
      ydoc.on('destroy', onLiveDestroy);
      return Promise.race([provider.whenSynced, destroyed])
        .finally(() => {
          ydoc.off('destroy', onLiveDestroy);
        })
        .then(() => undefined);
    });

  return { ready };
}
