import type { ElementContent, ElementId, StylePatch, StyleProps, TemplateElement } from './template';
import type { Scope } from './viewport';

export type EditSource = 'canvas' | 'code' | 'ai' | 'restore';

export type RevisionKind = 'manual' | 'ai-accepted' | 'restore' | 'structure';

export interface SetContentCommand {
  kind: 'set-content';
  source: EditSource;
  targetIds: [ElementId];
  scope: Scope;
  baseRevision: number;
  content: ElementContent;
}

export interface SetStyleCommand {
  kind: 'set-style';
  source: EditSource;
  targetIds: ElementId[];
  scope: Scope;
  baseRevision: number;
  stylePatch: StylePatch;
}

export interface ReorderCommand {
  kind: 'reorder';
  source: EditSource;
  targetIds: [ElementId];
  scope: Scope;
  baseRevision: number;
  index: number;
}

export interface InsertCommand {
  kind: 'insert';
  source: EditSource;
  targetIds: [];
  scope: Scope;
  baseRevision: number;
  parentId: ElementId;
  index: number;
  element: TemplateElement;
}

export interface RemoveCommand {
  kind: 'remove';
  source: EditSource;
  targetIds: ElementId[];
  scope: Scope;
  baseRevision: number;
}

export type EditCommand =
  | SetContentCommand
  | SetStyleCommand
  | ReorderCommand
  | InsertCommand
  | RemoveCommand;

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
  baseRevision: number;
  timestamp: number;
}

export type HistoryLog = Record<ElementId, RevisionEntry[]>;
