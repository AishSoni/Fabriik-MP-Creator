import { useMemo, useState } from 'react';
import { runDemoEngine } from '../../engine/ai/scenarioEngine';
import { groupExamples } from '../../engine/ai/exampleCatalog';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import { useReviewStore } from '../../store/reviewStore';
import type { Proposal, DemoError } from '../../types/proposal';

const ERROR_TITLES: Record<DemoError['code'], string> = {
  'unsupported-instruction': 'Unsupported instruction',
  'unselected-target': 'Target outside selection',
  'forbidden-field': 'Forbidden field',
  'stale-revision': 'Stale revision',
};

export function AiDemoPanel() {
  const doc = useTemplateStore((s) => s.doc);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editScope = useEditorStore((s) => s.editScope);
  const pendingResult = useReviewStore((s) => s.pendingResult);
  const setPendingResult = useReviewStore((s) => s.setPendingResult);
  const acceptProposal = useReviewStore((s) => s.acceptProposal);
  const rejectProposal = useReviewStore((s) => s.rejectProposal);
  const acceptAllPending = useReviewStore((s) => s.acceptAllPending);
  const rejectAllPending = useReviewStore((s) => s.rejectAllPending);

  const [instruction, setInstruction] = useState('Rewrite the text to be more exciting');
  const exampleGroups = useMemo(
    () => groupExamples(undefined, selectedIds.length),
    [selectedIds.length],
  );

  const run = () => {
    const result = runDemoEngine({ instruction, selectedIds, scope: editScope }, doc);
    setPendingResult(result);
  };

  const proposals = pendingResult?.proposals ?? [];
  const accepted = proposals.filter((p) => p.status === 'accepted').length;
  const rejected = proposals.filter((p) => p.status === 'rejected').length;
  const invalid = proposals.filter((p) => p.status === 'invalid').length;
  const anyPending = proposals.some((p) => p.status === 'pending');

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-slate-600">Instruction for the selected elements</span>
        <textarea
          aria-label="AI instruction"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
        />
      </label>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Selection: {selectedIds.length === 0 ? <strong className="text-red-600">none</strong> : selectedIds.join(', ')}
        </span>
        <span>Scope: {editScope}</span>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={selectedIds.length === 0 || instruction.trim().length === 0}
        className="cursor-pointer rounded-md bg-violet-600 px-3 py-2 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        Run deterministic demo
      </button>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="example-gallery">
        <div className="text-xs font-semibold text-slate-600">
          Examples — click one to autofill the prompt
          {selectedIds.length > 1 && (
            <span className="ml-1 font-normal text-violet-600">(multi-element picks shown first)</span>
          )}
        </div>
        {exampleGroups.map((group) => (
          <div key={group.category} className="mt-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.label}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {group.items.map((example) => (
                <button
                  key={example.instruction}
                  type="button"
                  onClick={() => setInstruction(example.instruction)}
                  aria-label={`Autofill ${example.description}`}
                  title={example.instruction}
                  disabled={example.category === 'multi-element' && selectedIds.length < 2}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    instruction === example.instruction
                      ? 'border-violet-500 bg-violet-100 text-violet-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40'
                  }`}
                >
                  {example.description}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {pendingResult?.error && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-bold uppercase tracking-wide">{ERROR_TITLES[pendingResult.error.code]}</p>
          <p>{pendingResult.error.message}</p>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs">
            <span data-testid="review-summary">
              {accepted} accepted · {rejected} rejected · {invalid} blocked ·{' '}
              {proposals.length - accepted - rejected - invalid} pending
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={acceptAllPending}
                disabled={!anyPending}
                className="cursor-pointer rounded border border-emerald-300 px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={rejectAllPending}
                disabled={!anyPending}
                className="cursor-pointer rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Reject all
              </button>
            </div>
          </div>

          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              onAccept={() => acceptProposal(proposal.proposalId)}
              onReject={() => rejectProposal(proposal.proposalId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  onAccept,
  onReject,
}: {
  proposal: Proposal;
  onAccept: () => void;
  onReject: () => void;
}) {
  const badge =
    proposal.status === 'accepted'
      ? 'bg-emerald-100 text-emerald-700'
      : proposal.status === 'rejected'
        ? 'bg-slate-200 text-slate-600'
        : proposal.status === 'invalid'
          ? 'bg-red-100 text-red-700'
          : 'bg-blue-100 text-blue-700';

  return (
    <article className={`rounded-lg border p-3 ${proposal.status === 'accepted' ? 'border-emerald-300' : 'border-slate-200'}`}>
      <header className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}>{proposal.status}</span>
        <span className="truncate font-mono text-xs text-slate-700">{proposal.targetId}</span>
      </header>

      <p className="mt-1 text-xs text-slate-600">{proposal.explanation}</p>

      <dl className="mt-2 space-y-1 font-mono text-[11px]" data-testid={`diff-${proposal.targetId}`}>
        {contentDiff(
          proposal.before.content as Record<string, unknown> | undefined,
          proposal.after.content as Record<string, unknown> | undefined,
        )}
        {styleDiff(proposal.before.style as Record<string, unknown> | undefined, proposal.after.style as Record<string, unknown> | undefined)}
      </dl>

      {proposal.invalidReason && (
        <p role="alert" className="mt-1 text-[11px] text-red-600">{proposal.invalidReason}</p>
      )}

      <footer className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={proposal.status !== 'pending'}
          className="cursor-pointer rounded border border-emerald-400 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={proposal.status !== 'pending'}
          className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reject
        </button>
      </footer>
    </article>
  );
}

function contentDiff(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): React.ReactNode[] {
  if (!after && !before) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const nodes: React.ReactNode[] = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    nodes.push(
      <div key={`c-${key}`} className="text-slate-600">
        <dt className="inline font-bold">{key}: </dt>
        <dd className="inline">
          <span className="text-red-600 line-through">{String(truncate(b ?? '∅'))}</span>
          {' → '}
          <span className="text-emerald-700">{String(truncate(a ?? '∅'))}</span>
        </dd>
      </div>,
    );
  }
  return nodes;
}

function styleDiff(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): React.ReactNode[] {
  if (!after) return [];
  const keys = Object.keys(after);
  const nodes: React.ReactNode[] = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after[key];
    if (b === a) continue;
    nodes.push(
      <div key={`s-${key}`} className="text-slate-600">
        <dt className="inline font-bold">{key}: </dt>
        <dd className="inline">
          <span className="text-red-600 line-through">{b === undefined ? 'unset' : String(b)}</span>
          {' → '}
          <span className="text-emerald-700">{String(a)}</span>
        </dd>
      </div>,
    );
  }
  return nodes;
}

function truncate(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}
