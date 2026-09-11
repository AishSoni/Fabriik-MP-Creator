import type { ElementContent, ElementId, StylePatch, StyleProps, TemplateDoc, TemplateElement } from './template';
import type { Scope } from './viewport';

export type EditSource = 'canvas' | 'code' | 'ai' | 'restore';

export type RevisionKind = 'manual' | 'ai-accepted' | 'restore' | 'structure';

export interface SetContentCommand {
  kind: 'set-content';
  source: EditSource;
  targetIds: [ElementId];
  scope: Scope;
  content: ElementContent;
}

export interface SetStyleCommand {
  kind: 'set-style';
  source: EditSource;
  targetIds: ElementId[];
  scope: Scope;
  stylePatch: StylePatch;
}

export interface ReorderCommand {
  kind: 'reorder';
  source: EditSource;
  targetIds: [ElementId];
  scope: Scope;
  index: number;
}

export interface InsertCommand {
  kind: 'insert';
  source: EditSource;
  targetIds: [];
  scope: Scope;
  parentId: ElementId;
  index: number;
  element: TemplateElement;
}

export interface RemoveCommand {
  kind: 'remove';
  source: EditSource;
  targetIds: ElementId[];
  scope: Scope;
}

/**
 * Room-scoped metadata op: renames the template for every peer. It carries no
 * element targets, so it can never enter the element history log.
 */
export interface RenameCommand {
  kind: 'rename';
  source: EditSource;
  targetIds: [];
  scope: 'all';
  templateName: string;
}

export type ReplaceDocReason = 'import' | 'load-template' | 'reset';

/**
 * Room-scoped whole-document op (HLD §4.3): replaces the authoritative doc for
 * every peer in one transaction and clears shared history. The payload must be
 * a normalized document (content.base present); `by` is a display-only hint.
 */
export interface ReplaceDocCommand {
  kind: 'replace-doc';
  source: EditSource;
  targetIds: [];
  scope: 'all';
  reason: ReplaceDocReason;
  doc: TemplateDoc;
  by?: string;
}

export type EditCommand =
  | SetContentCommand
  | SetStyleCommand
  | ReorderCommand
  | InsertCommand
  | RemoveCommand
  | RenameCommand
  | ReplaceDocCommand;

export type StyleSnapshot = Partial<Record<keyof StyleProps, number | string | null>>;

export interface ElementSnapshot {
  content?: ElementContent;
  style?: StyleSnapshot;
  element?: TemplateElement;
}

export interface StructuralInfo {
  op: 'reorder' | 'insert' | 'remove';
  parentId?: ElementId;
  index?: number;
  previousIndex?: number;
  removedSubtree?: TemplateElement[];
}

export interface RevisionEntry {
  id: string;
  commandId: string;
  elementId: ElementId;
  scope: Scope;
  source: EditSource;
  kind: RevisionKind;
  label: string;
  before: ElementSnapshot;
  after: ElementSnapshot;
  structural?: StructuralInfo;
  timestamp: number;
}

export type HistoryLog = Record<ElementId, RevisionEntry[]>;
