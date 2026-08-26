import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EditCommand, HistoryLog, RevisionEntry } from '../types/commands';
import type { TemplateDoc } from '../types/template';
import { commitCommand } from '../engine/commit';
import { restoreRevision } from '../engine/restore';
import { validateCommand, type CommandError } from '../engine/validate';
import { templateDocSchema } from '../engine/validate';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { defaultContentFor } from '../types/template';

interface TemplateState {
  doc: TemplateDoc;
  history: HistoryLog;
  lastErrors: CommandError[];
  dispatch: (command: EditCommand) => CommandError[];
  dispatchMany: (commands: EditCommand[]) => CommandError[];
  restore: (entry: RevisionEntry) => void;
  replaceDoc: (doc: unknown) => CommandError[] | null;
  resetDoc: () => void;
}

const initialHistory: HistoryLog = {};

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      doc: createDefaultTemplate(),
      history: initialHistory,
      lastErrors: [],

      dispatch: (command) => {
        const { doc, history } = get();
        const errors = validateCommand(doc, command);
        if (errors.length > 0) {
          set({ lastErrors: errors });
          return errors;
        }
        const result = commitCommand(doc, history, command);
        set({ doc: result.doc, history: result.history, lastErrors: [] });
        return [];
      },

      dispatchMany: (commands) => {
        let currentDoc = get().doc;
        let currentHistory = get().history;
        for (const command of commands) {
          const errors = validateCommand(currentDoc, command);
          if (errors.length > 0) {
            set({ lastErrors: errors });
            return errors;
          }
          const result = commitCommand(currentDoc, currentHistory, command);
          currentDoc = result.doc;
          currentHistory = result.history;
        }
        set({ doc: currentDoc, history: currentHistory, lastErrors: [] });
        return [];
      },

      restore: (entry) => {
        const { doc, history } = get();
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
          history: { ...history, [entry.elementId]: [...(history[entry.elementId] ?? []), result.revision] },
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
        if (parsed.data.revision !== get().doc.revision) {
          const errors = [
            {
              code: 'stale-revision' as const,
              message: `document revision ${parsed.data.revision} does not match current revision ${get().doc.revision}`,
            },
          ];
          set({ lastErrors: errors });
          return errors;
        }
        const normalized: TemplateDoc = {
          templateId: parsed.data.templateId,
          templateName: parsed.data.templateName,
          revision: parsed.data.revision,
          rootId: parsed.data.rootId,
          elements: Object.fromEntries(
            Object.entries(parsed.data.elements).map(([id, element]) => [
              id,
              {
                ...element,
                content: { base: element.content.base ?? defaultContentFor(element.type), overrides: element.content.overrides },
              },
            ]),
          ),
        };
        set({ doc: normalized, lastErrors: [] });
        return null;
      },

      resetDoc: () => {
        set({ doc: createDefaultTemplate(), history: initialHistory, lastErrors: [] });
      },
    }),
    {
      name: 'sate-template-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ doc: state.doc, history: state.history }),
    },
  ),
);

