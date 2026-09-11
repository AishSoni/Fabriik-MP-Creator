import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Y from 'yjs';
import type {
  EditCommand,
  HistoryLog,
  ReplaceDocCommand,
  ReplaceDocReason,
  RevisionEntry,
} from '../types/commands';
import type { ElementId, TemplateDoc } from '../types/template';
import { defaultContentFor } from '../types/template';
import { commitCommand, appendRevisions } from '../engine/commit';
import { restoreRevision, invertRevisionGroup } from '../engine/restore';
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
import { isYdocPipeline } from '../collab/flag';
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
 * History entries exist in two producer shapes: the legacy immer pipeline
 * (RevisionEntry, no sequence marker) and the Yjs pipeline
 * (CollabRevisionEntry = RevisionEntry with an optional serverSeq key).
 * After dropping the retired `baseRevision` field the two types unified;
 * the `serverSeq` key's presence separates the shapes at runtime, and stale
 * persisted blobs carrying `baseRevision` are ignored by the guards.
 */
export type AnyRevisionEntry = CollabRevisionEntry;
export type AnyHistoryLog = Record<ElementId, AnyRevisionEntry[]>;

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

const isYdocEntry = (entry: AnyRevisionEntry): boolean => 'serverSeq' in entry;

/** Narrow a mixed history log for the legacy immer pipeline (identity on legacy logs). */
const legacyLog = (log: AnyHistoryLog): HistoryLog =>
  Object.fromEntries(
    Object.entries(log).map(([id, list]) => [id, list.filter((entry) => !isYdocEntry(entry))]),
  );

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
  if (isYdocPipeline()) setTemplateNameOnYdoc(name);
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
  if (isYdocPipeline() || isRoomActive()) {
    const bound = bindTemplatePersistence(created.ydoc, DEFAULT_YDOC_DB_NAME, {
      seedDoc: () => useTemplateStore.getState().doc,
      migrateLegacy: true,
    });
    persistenceReady = bound.ready;
    void bound.ready.catch(() => {});
  }
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

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      doc: createEditorialTemplate(),
      history: initialHistory,
      past: [],
      future: [],
      lastErrors: [],
      activeTemplateId: FALLBACK_TEMPLATE_ID,

      dispatch: (command) => {
        if (isYdocPipeline() || isRoomActive()) {
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
        }
        const { doc, history, past } = get();
        const errors = validateCommand(doc, command);
        if (errors.length > 0) {
          set({ lastErrors: errors });
          return errors;
        }
        const result = commitCommand(doc, legacyLog(history), command);
        set({
          doc: result.doc,
          history: result.history,
          past: pushSnapshot(past, { doc, revisions: result.revisions }),
          future: [],
          lastErrors: [],
        });
        return [];
      },

      dispatchMany: (commands) => {
        if (commands.length === 0) return [];
        if (isYdocPipeline() || isRoomActive()) {
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
        }
        const { doc, history, past } = get();
        const snapshotDoc = doc;
        const allRevisions: RevisionEntry[] = [];
        let currentDoc = doc;
        let currentHistory: HistoryLog = legacyLog(history);
        for (const rawCommand of commands) {
          const errors = validateCommand(currentDoc, rawCommand);
          if (errors.length > 0) {
            set({ lastErrors: errors });
            return errors;
          }
          const result = commitCommand(currentDoc, currentHistory, rawCommand);
          currentDoc = result.doc;
          currentHistory = result.history;
          allRevisions.push(...result.revisions);
        }
        set({
          doc: currentDoc,
          history: currentHistory,
          past: pushSnapshot(past, { doc: snapshotDoc, revisions: allRevisions }),
          future: [],
          lastErrors: [],
        });
        return [];
      },

      restore: (entry) => {
        if (isYdocPipeline() || isRoomActive()) {
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
          return;
        }
        if (isYdocEntry(entry)) return;
        const { doc, history, past } = get();
        const result = restoreRevision(doc, entry);
        if (!result.revision) {
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
        set({
          doc: result.doc,
          history: appendRevisions(legacyLog(history), [result.revision]),
          past: pushSnapshot(past, { doc, revisions: [result.revision] }),
          future: [],
          lastErrors: [],
        });
      },

      undo: () => {
        const { doc, history, past, future } = get();
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
        if (isYdocPipeline() || isRoomActive()) {
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
          return;
        }
        if (step.revisions.length === 0) {
          // Revision-less step (e.g. template rename): fall back to the
          // snapshot without touching the append-only history.
          set({
            doc: { ...step.doc, revision: doc.revision + 1 },
            past: remaining,
            future: [{ doc, revisions: [] }, ...future].slice(-MAX_UNDO_STEPS),
            lastErrors: [],
          });
          return;
        }
        const legacyRevisions = step.revisions.filter((entry) => !isYdocEntry(entry));
        const result = invertRevisionGroup(doc, legacyRevisions);
        set({
          doc: result.doc,
          history: appendRevisions(legacyLog(history), result.revisions),
          past: remaining,
          future: [{ doc, revisions: result.revisions }, ...future].slice(-MAX_UNDO_STEPS),
          lastErrors: [],
        });
      },

      redo: () => {
        const { doc, history, past, future } = get();
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
        if (isYdocPipeline() || isRoomActive()) {
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
          return;
        }
        if (step.revisions.length === 0) {
          set({
            doc: { ...step.doc, revision: doc.revision + 1 },
            past: pushSnapshot(past, { doc, revisions: [] }),
            future: rest,
            lastErrors: [],
          });
          return;
        }
        const legacyRevisions = step.revisions.filter((entry) => !isYdocEntry(entry));
        const result = invertRevisionGroup(doc, legacyRevisions);
        set({
          doc: result.doc,
          history: appendRevisions(legacyLog(history), result.revisions),
          past: pushSnapshot(past, { doc, revisions: result.revisions }),
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
        if (isYdocPipeline()) {
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
        }
        set({
          doc: normalized,
          history: {},
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
        if (isYdocPipeline()) {
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
        }
        set({
          doc: definition.create(),
          history: {},
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
        if (isYdocPipeline()) {
          const ydoc = getTemplateYdoc();
          replaceYDoc(ydoc, fresh);
          set({
            doc: projectDoc(ydoc),
            history: historyFromYdoc(ydoc),
            past: [],
            future: [],
            lastErrors: [],
          });
          return;
        }
        set({
          doc: fresh,
          history: {},
          past: [],
          future: [],
          lastErrors: [],
        });
      },
    }),
    {
      name: 'fabriik-template-v1',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) =>
        isYdocPipeline()
          ? {}
          : {
              doc: state.doc,
              history: state.history,
              past: state.past,
              future: state.future,
              activeTemplateId: state.activeTemplateId,
            },
      migrate: (persisted, version) => {
        const data = persisted as {
          doc?: TemplateDoc;
          activeTemplateId?: string;
          past?: UndoStep[];
          future?: UndoStep[];
        } & Record<string, unknown>;
        if ((version ?? 1) < 2 && !data.activeTemplateId) {
          data.activeTemplateId = data.doc?.templateId ?? FALLBACK_TEMPLATE_ID;
        }
        if ((version ?? 1) < 4) {
          // Undo stack shape changed (append-only revision groups); drop stale stacks.
          data.past = [];
          data.future = [];
        }
        return data as typeof persisted;
      },
      merge: (persisted, current) => {
        const data = (persisted ?? {}) as { doc?: unknown };
        if (data.doc !== undefined && !templateDocSchema.safeParse(data.doc).success) {
          return {
            ...current,
            doc: createEditorialTemplate(),
            history: initialHistory,
            past: [],
            future: [],
            activeTemplateId: FALLBACK_TEMPLATE_ID,
            lastErrors: [
              {
                code: 'invalid-payload' as const,
                message:
                  'invalid json template: persisted state failed validation and was reset to the default template',
              },
            ],
          };
        }
        return { ...current, ...(persisted as Record<string, unknown>) };
      },
    },
  ),
);

