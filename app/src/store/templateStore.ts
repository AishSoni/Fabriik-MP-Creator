import { create } from 'zustand';
import * as Y from 'yjs';
import type {
  EditCommand,
  ReplaceDocCommand,
  ReplaceDocReason,
} from '../types/commands';
import type { ElementId, TemplateDoc } from '../types/template';
import { defaultContentFor } from '../types/template';
import {
  validateCommand,
  templateDocSchema,
  validateTemplateSemantics,
  zodErrorToCommandErrors,
  type CommandError,
} from '../engine/validate';
import { diffDocs } from '../engine/diffCommands';
import { createEditorialTemplate } from '../template/editorialTemplate';
import { getTemplateById } from '../template';
import { createTemplateProjector, type TemplateProjector } from '../collab/project';
import {
  TEMPLATE_NAME_FIELD,
  getHistoryYArray,
  getMetaYMap,
  initializeTemplateYDoc,
  projectDoc,
} from '../collab/schema';
import { applyCommandToYDoc, replaceYDoc, type CollabRevisionEntry } from '../collab/commandAdapter';
import { commandsFromRevision } from '../collab/commands';
import {
  DEFAULT_YDOC_DB_NAME,
  bindTemplatePersistence,
  seedTemplateYdoc,
} from '../collab/persistence';
import { newCommandId } from '../collab/ids';
import { TemplateRoomProvider } from '../collab/provider';
import {
  bindPresence,
  presenceNoticeMessage,
  resolveIdentity,
  type PresenceNotice,
} from '../collab/presence';
import { useEditorStore } from './editorStore';

/**
 * History entries produced by the Yjs pipeline. After dropping the retired
 * `baseRevision` field the legacy `RevisionEntry` and `CollabRevisionEntry`
 * shapes unified into a single type.
 */
export type AnyRevisionEntry = CollabRevisionEntry;
export type AnyHistoryLog = Record<ElementId, AnyRevisionEntry[]>;;

/**
 * One atomic undo step. `doc` is the document before the step (fallback for
 * revision-less steps such as a template rename); `revisions` are the history
 * entries the step appended. Undo/redo invert those entries, so the history
 * log itself is append-only and never shrinks.
 */
interface UndoStep {
  doc: TemplateDoc;
  revisions: AnyRevisionEntry[];
}

interface TemplateState {
  doc: TemplateDoc;
  history: AnyHistoryLog;
  past: UndoStep[];
  future: UndoStep[];
  lastErrors: CommandError[];
  activeTemplateId: string;
  dispatch: (command: EditCommand) => CommandError[];
  dispatchMany: (commands: EditCommand[]) => CommandError[];
  restore: (entry: AnyRevisionEntry) => void;
  undo: () => void;
  redo: () => void;
  replaceDoc: (doc: unknown) => CommandError[];
  importDoc: (doc: unknown) => CommandError[] | null;
  loadTemplate: (templateId: string) => CommandError[] | null;
  resetDoc: () => void;
}

const initialHistory: AnyHistoryLog = {};
const FALLBACK_TEMPLATE_ID = 'tpl-editorial-v1';

/** Maximum number of undo steps kept in memory and persisted. */
export const MAX_UNDO_STEPS = 50;

function pushSnapshot(
  past: UndoStep[],
  snapshot: UndoStep,
): UndoStep[] {
  return [...past, snapshot].slice(-MAX_UNDO_STEPS);
}

function historyFromYdoc(ydoc: Y.Doc): AnyHistoryLog {
  const log: AnyHistoryLog = {};
  for (const entry of getHistoryYArray(ydoc).toArray()) {
    (log[entry.elementId] ??= []).push(entry);
  }
  return log;
}

/** Renames the template inside the Y doc meta so the projection stays in sync. */
function setTemplateNameOnYdoc(name: string): void {
  const ydoc = getTemplateYdoc();
  ydoc.transact(() => {
    getMetaYMap(ydoc).set(TEMPLATE_NAME_FIELD, name);
  });
}

/** Routes a template rename through the room when connected, else the Y doc meta. */
function applyTemplateName(name: string): void {
  if (isRoomActive()) {
    getRoomProvider()?.dispatch({
      kind: 'rename',
      source: 'code',
      targetIds: [],
      scope: 'all',
      templateName: name,
    });
    return;
  }
  setTemplateNameOnYdoc(name);
}

/** A whole-doc replacement command forwarded to the room authority. */
function roomReplace(reason: ReplaceDocReason, doc: TemplateDoc): ReplaceDocCommand {
  return {
    kind: 'replace-doc',
    source: 'code',
    targetIds: [],
    scope: 'all',
    reason,
    doc,
    by: resolveIdentity().name,
  };
}

let projector: TemplateProjector | null = null;
let persistenceReady: Promise<void> = Promise.resolve();

function ensureProjector(seedDoc: TemplateDoc): TemplateProjector {
  if (projector) return projector;
  const created = createTemplateProjector();
  const bound = bindTemplatePersistence(created.ydoc, DEFAULT_YDOC_DB_NAME, {
    seedDoc: () => useTemplateStore.getState().doc,
    migrateLegacy: true,
  });
  persistenceReady = bound.ready;
  void bound.ready.catch(() => {});
  seedTemplateYdoc(created.ydoc, seedDoc);
  created.subscribe((doc) => {
    const previous = useTemplateStore.getState();
    const replaced = previous.doc.templateId !== doc.templateId;
    useTemplateStore.setState({
      doc,
      history: historyFromYdoc(created.ydoc),
      activeTemplateId: doc.templateId,
      ...(replaced ? { past: [], future: [] } : {}),
    });
  });
  projector = created;
  return created;
}

/** Resolves once the Y.Doc persistence binding finished its initial sync (tests). */
export function whenTemplatePersistenceReady(): Promise<void> {
  return persistenceReady;
}

/** The app Y.Doc backing the Yjs pipeline (creates and hydrates it on demand). */
export function getTemplateYdoc(): Y.Doc {
  return ensureProjector(useTemplateStore.getState().doc).ydoc;
}

/** Destroys the Y.Doc projector singleton (used on reloads and in tests). */
export function resetYdocPipeline(): void {
  persistenceReady = Promise.resolve();
  if (!projector) return;
  const ydoc = projector.ydoc;
  projector.destroy();
  projector = null;
  ydoc.destroy();
}

type YApplyResult =
  | { ok: true; before: TemplateDoc; entries: CollabRevisionEntry[] }
  | { ok: false; errors: CommandError[] };

let roomProvider: TemplateRoomProvider | null = null;
let unbindPresence: (() => void) | null = null;

export function isRoomActive(): boolean {
  return roomProvider !== null;
}

export function getRoomProvider(): TemplateRoomProvider | null {
  return roomProvider;
}

export function attachRoomProvider(
  host: string,
  room: string,
  options: { role: 'create' | 'join'; party?: string },
): TemplateRoomProvider {
  if (roomProvider) return roomProvider;
  const ydoc = getTemplateYdoc();
  if (options.role === 'join') {
    replaceYDoc(ydoc, {
      templateId: 'tpl-empty',
      templateName: 'Untitled',
      revision: 0,
      rootId: 'page-root',
      elements: {},
    });
  }
  const provider = new TemplateRoomProvider(host, room, ydoc, {
    connect: true,
    uploadLocal: options.role === 'create',
    party: options.party,
  });
  unbindPresence = bindPresence({
    awareness: provider.awareness,
    identity: resolveIdentity(),
    getSelectedIds: () => useEditorStore.getState().selectedIds,
    subscribeSelectedIds: (listener) =>
      useEditorStore.subscribe((state, previous) => {
        if (state.selectedIds !== previous.selectedIds) listener();
      }),
    subscribeNotices: (listener) => {
      const handler = (notices: PresenceNotice[]): void => {
        for (const notice of notices) listener(notice);
      };
      provider.on('room-notice', handler);
      return () => provider.off('room-notice', handler);
    },
    onNotice: (notice) => {
      const message = presenceNoticeMessage(notice);
      if (message) useEditorStore.getState().setToastMessage(message);
    },
  });
  roomProvider = provider;
  return provider;
}

export function detachRoomProvider(): void {
  if (!roomProvider) return;
  unbindPresence?.();
  unbindPresence = null;
  roomProvider.destroy();
  roomProvider = null;
}

/**
 * Validates commands against a throwaway Y.Doc clone of the live doc
 * (so a failing sequence leaves the real Y.Doc untouched), then applies
 * them all authoritatively. Returns the pre-apply projection and every
 * history entry the batch appended.
 */
function applyToYdoc(commands: EditCommand[]): YApplyResult {
  if (commands.length === 0) {
    return { ok: true, before: projectDoc(getTemplateYdoc()), entries: [] };
  }
  const ydoc = getTemplateYdoc();
  const before = projectDoc(ydoc);
  const scratch = new Y.Doc();
  try {
    Y.applyUpdate(scratch, Y.encodeStateAsUpdate(ydoc));
    for (const raw of commands) {
      const errors = validateCommand(projectDoc(scratch), raw);
      if (errors.length > 0) return { ok: false, errors };
      applyCommandToYDoc(scratch, raw, {
        origin: 'optimistic',
        commandId: newCommandId(),
      });
    }
  } finally {
    scratch.destroy();
  }
  if (roomProvider) {
    for (const raw of commands) {
      roomProvider.dispatch(raw, { optimistic: raw.kind !== 'replace-doc' });
    }
    return { ok: true, before, entries: [] };
  }
  const entries: CollabRevisionEntry[] = [];
  for (const raw of commands) {
    const result = applyCommandToYDoc(ydoc, raw, {
      origin: 'authoritative',
      commandId: newCommandId(),
    });
    entries.push(...result.entries);
  }
  return { ok: true, before, entries };
}

export const useTemplateStore = create<TemplateState>()((set, get) => ({
      doc: createEditorialTemplate(),
      history: initialHistory,
      past: [],
      future: [],
      lastErrors: [],
      activeTemplateId: FALLBACK_TEMPLATE_ID,

      dispatch: (command) => {
        const result = applyToYdoc([command]);
        if (!result.ok) {
          set({ lastErrors: result.errors });
          return result.errors;
        }
        const ydoc = getTemplateYdoc();
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: pushSnapshot(get().past, { doc: result.before, revisions: result.entries }),
          future: [],
          lastErrors: [],
        });
        return [];
      },

      dispatchMany: (commands) => {
        if (commands.length === 0) return [];
        const result = applyToYdoc(commands);
        if (!result.ok) {
          set({ lastErrors: result.errors });
          return result.errors;
        }
        const ydoc = getTemplateYdoc();
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: pushSnapshot(get().past, { doc: result.before, revisions: result.entries }),
          future: [],
          lastErrors: [],
        });
        return [];
      },

      restore: (entry) => {
        const inverse = commandsFromRevision(projectDoc(getTemplateYdoc()), entry);
        if (inverse.length === 0) {
          set({
            lastErrors: [
              {
                code: 'invalid-target',
                message: `cannot restore revision ${entry.id}: original location no longer exists`,
              },
            ],
          });
          return;
        }
        const result = applyToYdoc(inverse);
        if (!result.ok) {
          set({ lastErrors: result.errors });
          return;
        }
        const ydoc = getTemplateYdoc();
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: pushSnapshot(get().past, { doc: result.before, revisions: result.entries }),
          future: [],
          lastErrors: [],
        });
      },

      undo: () => {
        const { past, future } = get();
        if (past.length === 0) return;
        const step = past[past.length - 1];
        const remaining = past.slice(0, -1);
        if (isRoomActive()) {
          set({
            lastErrors: [
              { code: 'invalid-target', message: 'Undo is unavailable while sharing a room (P3)' },
            ],
          });
          return;
        }
        const ydoc = getTemplateYdoc();
        const current = projectDoc(ydoc);
        if (step.revisions.length === 0) {
          // Revision-less snapshot step (e.g. template rename): rebuild the
          // Y doc from the snapshot in one transaction; history is preserved.
          initializeTemplateYDoc(ydoc, step.doc);
          set({
            doc: projectDoc(ydoc),
            history: historyFromYdoc(ydoc),
            past: remaining,
            future: [{ doc: current, revisions: [] }, ...future].slice(-MAX_UNDO_STEPS),
            lastErrors: [],
          });
          return;
        }
        const inverse: EditCommand[] = [];
        for (let i = step.revisions.length - 1; i >= 0; i -= 1) {
          inverse.push(...commandsFromRevision(current, step.revisions[i]));
        }
        const result = applyToYdoc(inverse);
        if (!result.ok) {
          set({ lastErrors: result.errors });
          return;
        }
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: remaining,
          future: [{ doc: result.before, revisions: result.entries }, ...future].slice(-MAX_UNDO_STEPS),
          lastErrors: [],
        });
      },

      redo: () => {
        const { past, future } = get();
        if (future.length === 0) return;
        const [step, ...rest] = future;
        if (isRoomActive()) {
          set({
            lastErrors: [
              { code: 'invalid-target', message: 'Redo is unavailable while sharing a room (P3)' },
            ],
          });
          return;
        }
        const ydoc = getTemplateYdoc();
        const current = projectDoc(ydoc);
        if (step.revisions.length === 0) {
          initializeTemplateYDoc(ydoc, step.doc);
          set({
            doc: projectDoc(ydoc),
            history: historyFromYdoc(ydoc),
            past: pushSnapshot(past, { doc: current, revisions: [] }),
            future: rest,
            lastErrors: [],
          });
          return;
        }
        const inverse: EditCommand[] = [];
        for (let i = step.revisions.length - 1; i >= 0; i -= 1) {
          inverse.push(...commandsFromRevision(current, step.revisions[i]));
        }
        const result = applyToYdoc(inverse);
        if (!result.ok) {
          set({ lastErrors: result.errors });
          return;
        }
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: pushSnapshot(past, { doc: result.before, revisions: result.entries }),
          future: rest,
          lastErrors: [],
        });
      },

      replaceDoc: (candidate) => {
        const parsed = templateDocSchema.safeParse(candidate);
        if (!parsed.success) {
          const errors = parsed.error.issues.map((issue) => ({
            code: 'invalid-payload' as const,
            message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          }));
          set({ lastErrors: errors });
          return errors;
        }
        const raw = parsed.data;
        const normalized: TemplateDoc = {
          templateId: raw.templateId,
          templateName: raw.templateName,
          revision: raw.revision,
          rootId: raw.rootId,
          elements: Object.fromEntries(
            Object.entries(raw.elements).map(([id, element]) => [
              id,
              {
                ...element,
                content: {
                  base: element.content.base ?? defaultContentFor(element.type),
                  overrides: element.content.overrides,
                },
              },
            ]),
          ),
        };
        const { commands, errors } = diffDocs(get().doc, normalized, { source: 'code' });
        if (errors.length > 0) {
          const mapped = errors.map((message) => ({
            code: 'forbidden-field' as const,
            message,
          }));
          set({ lastErrors: mapped });
          return mapped;
        }
        const result = get().dispatchMany(commands);
        if (result.length === 0 && normalized.templateName !== get().doc.templateName) {
          if (commands.length === 0) {
            // Name-only change with no diff commands: still a single undoable step.
            const { doc, past } = get();
            applyTemplateName(normalized.templateName);
            set({
              doc: { ...doc, templateName: normalized.templateName },
              past: pushSnapshot(past, { doc, revisions: [] }),
              future: [],
            });
          } else {
            // Fold the rename into the same undo step pushed by dispatchMany.
            applyTemplateName(normalized.templateName);
            set((state) => ({ doc: { ...state.doc, templateName: normalized.templateName } }));
          }
        }
        return result;
      },

      importDoc: (candidate) => {
        const parsed = templateDocSchema.safeParse(candidate);
        if (!parsed.success) {
          const errors = zodErrorToCommandErrors(parsed.error);
          set({ lastErrors: errors });
          return errors;
        }
        const raw = parsed.data;
        const normalized: TemplateDoc = {
          templateId: raw.templateId,
          templateName: raw.templateName,
          revision: raw.revision,
          rootId: raw.rootId,
          elements: Object.fromEntries(
            Object.entries(raw.elements).map(([id, element]) => [
              id,
              {
                ...element,
                content: {
                  base: element.content.base ?? defaultContentFor(element.type),
                  overrides: element.content.overrides,
                },
              },
            ]),
          ),
        };
        const semanticErrors = validateTemplateSemantics(normalized);
        if (semanticErrors.length > 0) {
          set({ lastErrors: semanticErrors });
          return semanticErrors;
        }
        if (isRoomActive()) {
          const confirmed = window.confirm(
            `Import "${normalized.templateName}"? This will replace the document for everyone in this room.`,
          );
          if (!confirmed) return null;
          getRoomProvider()?.dispatch(roomReplace('import', normalized), { optimistic: false });
          set({ lastErrors: [] });
          return null;
        }
        const ydoc = getTemplateYdoc();
        replaceYDoc(ydoc, normalized);
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: [],
          future: [],
          activeTemplateId: normalized.templateId,
          lastErrors: [],
        });
        return null;
      },

      loadTemplate: (templateId) => {
        const definition = getTemplateById(templateId);
        if (!definition) {
          const errors = [
            {
              code: 'unknown-element' as const,
              message: `no template registered under "${templateId}"`,
            },
          ];
          set({ lastErrors: errors });
          return errors;
        }
        if (isRoomActive()) {
          const confirmed = window.confirm(
            `Switch everyone in this room to "${definition.name}"? This will replace the document for everyone.`,
          );
          if (!confirmed) return null;
          getRoomProvider()?.dispatch(roomReplace('load-template', definition.create()), {
            optimistic: false,
          });
          set({ lastErrors: [] });
          return null;
        }
        const ydoc = getTemplateYdoc();
        replaceYDoc(ydoc, definition.create());
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: [],
          future: [],
          activeTemplateId: definition.id,
          lastErrors: [],
        });
        return null;
      },

      resetDoc: () => {
        const fresh = (
          getTemplateById(get().activeTemplateId) ?? getTemplateById(FALLBACK_TEMPLATE_ID)!
        ).create();
        if (isRoomActive()) {
          const confirmed = window.confirm(
            `Reset the document for everyone in this room to "${fresh.templateName}"?`,
          );
          if (!confirmed) return;
          getRoomProvider()?.dispatch(roomReplace('reset', fresh), { optimistic: false });
          set({ lastErrors: [] });
          return;
        }
        const ydoc = getTemplateYdoc();
        replaceYDoc(ydoc, fresh);
        set({
          doc: projectDoc(ydoc),
          history: historyFromYdoc(ydoc),
          past: [],
          future: [],
          lastErrors: [],
        });
      },
}));

