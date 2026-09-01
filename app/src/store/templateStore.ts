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
import { getTemplateById } from '../template';

interface TemplateState {
  doc: TemplateDoc;
  history: HistoryLog;
  lastErrors: CommandError[];
  activeTemplateId: string;
  dispatch: (command: EditCommand) => CommandError[];
  dispatchMany: (commands: EditCommand[]) => CommandError[];
  restore: (entry: RevisionEntry) => void;
  replaceDoc: (doc: unknown) => CommandError[];
  loadTemplate: (templateId: string) => CommandError[] | null;
  resetDoc: () => void;
}

const initialHistory: HistoryLog = {};
const FALLBACK_TEMPLATE_ID = 'tpl-landing-v1';

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      doc: createDefaultTemplate(),
      history: initialHistory,
      lastErrors: [],
      activeTemplateId: FALLBACK_TEMPLATE_ID,

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
          history: initialHistory,
          activeTemplateId: definition.id,
          lastErrors: [],
        });
        return null;
      },

      resetDoc: () => {
        set({
          doc: (getTemplateById(get().activeTemplateId) ?? getTemplateById(FALLBACK_TEMPLATE_ID)!).create(),
          history: initialHistory,
          lastErrors: [],
        });
      },
    }),
    {
      name: 'fabriik-template-v1',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        doc: state.doc,
        history: state.history,
        activeTemplateId: state.activeTemplateId,
      }),
      migrate: (persisted, version) => {
        const data = persisted as { doc?: TemplateDoc; activeTemplateId?: string } & Record<string, unknown>;
        if ((version ?? 1) < 2 && !data.activeTemplateId) {
          data.activeTemplateId = data.doc?.templateId ?? FALLBACK_TEMPLATE_ID;
        }
        return data as typeof persisted;
      },
      merge: (persisted, current) => {
        const data = (persisted ?? {}) as { doc?: unknown };
        if (data.doc !== undefined && !templateDocSchema.safeParse(data.doc).success) {
          return {
            ...current,
            doc: createDefaultTemplate(),
            history: initialHistory,
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

