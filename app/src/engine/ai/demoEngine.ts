import { runDemoEngine } from './scenarioEngine';
import type { ProposalEngine } from './proposalEngine';

export const demoProposalEngine: ProposalEngine = {
  id: 'demo',
  label: 'Demo',
  run(input, doc) {
    return Promise.resolve(runDemoEngine(input, doc));
  },
};
