import type { ElementContent, ElementId, StyleProps } from './template';
import type { EditCommand, EditSource, RevisionEntry } from './commands';
import type { Scope } from './viewport';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'invalid';

export interface Proposal {
  proposalId: string;
  targetId: ElementId;
  status: ProposalStatus;
  explanation: string;
  before: { content?: ElementContent; style?: StyleProps };
  after: { content?: ElementContent; style?: StyleProps };
  invalidReason?: string;
  command: EditCommand & { source: Extract<EditSource, 'ai'> };
}

export type DemoErrorCode =
  | 'unsupported-instruction'
  | 'unselected-target'
  | 'forbidden-field'
  | 'stale-revision';

export interface DemoError {
  code: DemoErrorCode;
  message: string;
}

export interface DemoInput {
  instruction: string;
  selectedIds: ElementId[];
  scope: Scope;
}

export interface DemoResult {
  input: DemoInput;
  proposals: Proposal[];
  error?: DemoError;
}

export interface RestoreRequest {
  entry: RevisionEntry;
}
