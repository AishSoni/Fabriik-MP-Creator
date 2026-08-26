import { create } from 'zustand';
import type { DemoResult, Proposal } from '../types/proposal';
import { useTemplateStore } from './templateStore';

interface ReviewState {
  pendingResult: DemoResult | null;
  setPendingResult: (result: DemoResult | null) => void;
  acceptProposal: (proposalId: string) => void;
  rejectProposal: (proposalId: string) => void;
  acceptAllPending: () => void;
  rejectAllPending: () => void;
}

function updateProposal(proposalId: string, patch: Partial<Proposal>) {
  const review = useReviewStore.getState();
  if (!review.pendingResult) return;
  useReviewStore.setState({
    pendingResult: {
      ...review.pendingResult,
      proposals: review.pendingResult.proposals.map((p) =>
        p.proposalId === proposalId ? { ...p, ...patch } : p,
      ),
    },
  });
}

export const useReviewStore = create<ReviewState>()((set) => ({
  pendingResult: null,

  setPendingResult: (pendingResult) => set({ pendingResult }),

  acceptProposal: (proposalId) => {
    const result = useReviewStore.getState().pendingResult;
    if (!result) return;
    const proposal = result.proposals.find((p) => p.proposalId === proposalId);
    if (!proposal || proposal.status !== 'pending') return;

    const template = useTemplateStore.getState();
    if (proposal.generatedAt === undefined || proposal.command.baseRevision < proposal.generatedAt) {
      updateProposal(proposalId, {
        status: 'invalid',
        invalidReason: 'stale-revision: this proposal is older than the current document and cannot be applied',
      });
      return;
    }
    const rebased = { ...proposal.command, baseRevision: template.doc.revision };
    const errors = template.dispatch(rebased);
    if (errors.length > 0) {
      updateProposal(proposalId, {
        status: 'invalid',
        invalidReason: `${errors[0].code}: ${errors[0].message}`,
      });
      return;
    }
    updateProposal(proposalId, { status: 'accepted' });
  },

  rejectProposal: (proposalId) => {
    updateProposal(proposalId, { status: 'rejected' });
  },

  acceptAllPending: () => {
    const result = useReviewStore.getState().pendingResult;
    if (!result) return;
    for (const proposal of result.proposals) {
      if (useReviewStore.getState().pendingResult?.proposals.find((p) => p.proposalId === proposal.proposalId)?.status === 'pending') {
        useReviewStore.getState().acceptProposal(proposal.proposalId);
      }
    }
  },

  rejectAllPending: () => {
    const result = useReviewStore.getState().pendingResult;
    if (!result) return;
    set({
      pendingResult: {
        ...result,
        proposals: result.proposals.map((p) =>
          p.status === 'pending' ? { ...p, status: 'rejected' } : p,
        ),
      },
    });
  },
}));
