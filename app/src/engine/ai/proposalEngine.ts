import type { DemoInput, DemoResult } from '../../types/proposal';
import type { TemplateDoc } from '../../types/template';

export type ProposalEngineId = 'demo' | 'byok';

export interface ProposalEngine {
  id: ProposalEngineId;
  label: string;
  run(input: DemoInput, doc: TemplateDoc): Promise<DemoResult>;
}
