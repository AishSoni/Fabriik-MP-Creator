import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EditCommand, HistoryLog, RevisionEntry } from '../types/commands';
import type { TemplateDoc } from '../types/template';
import { defaultContentFor } from '../types/template';
import { commitCommand } from '../engine/commit';
import { restoreRevision } from '../engine/restore';
import { validateCommand, templateDocSchema, type CommandError } from '../engine/validate';
import { diffDocs } from '../engine/diffCommands';
import { createDefaultTemplate } from '../template/defaultTemplate';

interface TemplateState {
  doc: TemplateDoc;
  history: HistoryLog;
  lastErrors: CommandError[];
  dispatch: (command: EditCommand) => CommandError[];
  dispatchMany: (commands: EditCommand[]) => CommandError[];
  restore: (entry: RevisionEntry) => void;
  replaceDoc: (doc: unknown) => CommandError[];
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
          set((state) => ({ doc: { ...state.doc, templateName: normalized.templateName } }));
        }
        return result;
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

