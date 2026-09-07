import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EditCommand, HistoryLog, RevisionEntry } from '../types/commands';
import type { TemplateDoc } from '../types/template';
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

/**
 * One atomic undo step. `doc` is the document before the step (fallback for
 * revision-less steps such as a template rename); `revisions` are the history
 * entries the step appended. Undo/redo invert those entries, so the history
 * log itself is append-only and never shrinks.
 */
interface UndoStep {
  doc: TemplateDoc;
  revisions: RevisionEntry[];
}

interface TemplateState {
  doc: TemplateDoc;
  history: HistoryLog;
  past: UndoStep[];
  future: UndoStep[];
  lastErrors: CommandError[];
  activeTemplateId: string;
  dispatch: (command: EditCommand) => CommandError[];
  dispatchMany: (commands: EditCommand[]) => CommandError[];
  restore: (entry: RevisionEntry) => void;
  undo: () => void;
  redo: () => void;
  replaceDoc: (doc: unknown) => CommandError[];
  importDoc: (doc: unknown) => CommandError[] | null;
  loadTemplate: (templateId: string) => CommandError[] | null;
  resetDoc: () => void;
}

const initialHistory: HistoryLog = {};
const FALLBACK_TEMPLATE_ID = 'tpl-editorial-v1';

/** Maximum number of undo steps kept in memory and persisted. */
export const MAX_UNDO_STEPS = 50;

function pushSnapshot(
  past: UndoStep[],
  snapshot: UndoStep,
): UndoStep[] {
  return [...past, snapshot].slice(-MAX_UNDO_STEPS);
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
        const { doc, history, past } = get();
        const errors = validateCommand(doc, command);
        if (errors.length > 0) {
          set({ lastErrors: errors });
          return errors;
        }
        const result = commitCommand(doc, history, command);
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
        const { doc, history, past } = get();
        const snapshotDoc = doc;
        const allRevisions: RevisionEntry[] = [];
        let currentDoc = doc;
        let currentHistory = history;
        for (const rawCommand of commands) {
          const command = { ...rawCommand, baseRevision: currentDoc.revision } as EditCommand;
          const errors = validateCommand(currentDoc, command);
          if (errors.length > 0) {
            set({ lastErrors: errors });
            return errors;
          }
          const result = commitCommand(currentDoc, currentHistory, command);
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
          history: appendRevisions(history, [result.revision]),
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
        const result = invertRevisionGroup(doc, step.revisions);
        set({
          doc: result.doc,
          history: appendRevisions(history, result.revisions),
          past: remaining,
          future: [{ doc, revisions: result.revisions }, ...future].slice(-MAX_UNDO_STEPS),
          lastErrors: [],
        });
      },

      redo: () => {
        const { doc, history, past, future } = get();
        if (future.length === 0) return;
        const [step, ...rest] = future;
        if (step.revisions.length === 0) {
          set({
            doc: { ...step.doc, revision: doc.revision + 1 },
            past: pushSnapshot(past, { doc, revisions: [] }),
            future: rest,
            lastErrors: [],
          });
          return;
        }
        const result = invertRevisionGroup(doc, step.revisions);
        set({
          doc: result.doc,
          history: appendRevisions(history, result.revisions),
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
            set({
              doc: { ...doc, templateName: normalized.templateName },
              past: pushSnapshot(past, { doc, revisions: [] }),
              future: [],
            });
          } else {
            // Fold the rename into the same undo step pushed by dispatchMany.
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
        set({
          doc: (getTemplateById(get().activeTemplateId) ?? getTemplateById(FALLBACK_TEMPLATE_ID)!).create(),
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
      partialize: (state) => ({
        doc: state.doc,
        history: state.history,
        past: state.past,
        future: state.future,
        activeTemplateId: state.activeTemplateId,
      }),
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

