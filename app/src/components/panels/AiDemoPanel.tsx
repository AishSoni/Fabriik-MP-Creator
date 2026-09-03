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
  const darkMode = useEditorStore((s) => s.darkMode);
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
    <div className={`flex flex-col gap-4 p-4 text-sm animate-in ${darkMode ? 'text-stone' : 'text-ink'}`}>
      <label className="flex flex-col gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>Instruction</span>
        <span className={`text-xs leading-5 ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>Describe the change for the selected elements. Deterministic, reviewable, reversible.</span>
        <textarea
          aria-label="AI instruction"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Make the headline bolder and move the button below the copy"
          className={`min-h-[84px] rounded-2xl border px-3.5 py-3 text-[14px] leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors duration-200 placeholder:text-muted-dark focus:outline-none focus:ring-2 focus:ring-[#7868E6]/20 ${darkMode ? 'border-white/10 bg-surface-dark text-paper focus:border-accent' : 'border-stone bg-surface text-ink focus:border-accent'}`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${darkMode ? 'border-white/10 bg-surface/[0.06] text-muted-dark' : 'border-stone bg-surface text-muted shadow-sm'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${selectedIds.length === 0 ? 'bg-[#E85D4A]' : 'bg-accent'}`} />
          {selectedIds.length === 0 ? 'No selection' : `${selectedIds.length} selected · ${selectedIds.join(', ')}`}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${darkMode ? 'bg-paper text-ink' : 'bg-ink text-white'}`}
        >
          {editScope}
        </span>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={selectedIds.length === 0 || instruction.trim().length === 0}
        className={`group flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(120,104,230,0.28)] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent-strong hover:shadow-[0_10px_28px_rgba(120,104,230,0.34)] active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none ${darkMode ? 'disabled:bg-surface/10 disabled:text-muted' : 'disabled:bg-stone disabled:text-muted-dark'}`}
      >
        <span>Run deterministic demo</span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface/15 text-xs transition-transform duration-200 group-hover:translate-x-0.5">↗</span>
      </button>

      <div
        className={`rounded-[20px] border p-3.5 ${darkMode ? 'border-white/10 bg-surface-dark-raised' : 'border-stone bg-surface shadow-[0_1px_2px_rgba(22,22,24,0.06),0_12px_32px_rgba(22,22,24,0.06)]'}`}
        data-testid="example-gallery"
      >
        <div className={`flex items-baseline justify-between gap-2 text-xs font-semibold ${darkMode ? 'text-stone' : 'text-ink'}`}>
          <span>Examples</span>
          <span className={`text-[11px] font-normal ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>click to autofill</span>
        </div>
        {selectedIds.length > 1 && (
          <p className="mt-1 text-[11px] font-medium text-accent">Multi-element picks shown first</p>
        )}
        {exampleGroups.map((group) => (
          <div key={group.category} className="mt-3">
            <div className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>{group.label}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.items.map((example) => (
                <button
                  key={example.instruction}
                  type="button"
                  onClick={() => setInstruction(example.instruction)}
                  aria-label={`Autofill ${example.description}`}
                  title={
                    example.category === 'multi-element' && selectedIds.length < 2
                      ? 'Select at least two elements first'
                      : example.instruction
                  }
                  disabled={example.category === 'multi-element' && selectedIds.length < 2}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7868E6]/30 disabled:cursor-not-allowed disabled:opacity-40 ${
                    instruction === example.instruction
                      ? darkMode
                        ? 'border-[#A99CFF] bg-accent/20 text-stone shadow-sm'
                        : 'border-accent bg-accent-soft text-accent-strong shadow-sm'
                      : darkMode
                        ? 'border-white/10 bg-surface-dark text-muted-dark hover:border-accent/40 hover:text-stone'
                        : 'border-stone bg-paper text-muted-strong hover:border-accent/40 hover:bg-surface hover:text-ink'
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
        <div
          role="alert"
          className={`rounded-2xl border px-4 py-3 text-xs ${darkMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.08em]">{ERROR_TITLES[pendingResult.error.code]}</p>
          <p className="mt-1 leading-5">{pendingResult.error.message}</p>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="flex flex-col gap-3">
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-full border px-3 py-2 text-xs ${darkMode ? 'border-white/10 bg-surface-dark' : 'border-stone bg-surface-muted'}`}
          >
            <span data-testid="review-summary" className={`font-medium tabular-nums ${darkMode ? 'text-muted-dark' : 'text-muted'}`}>
              <span className="text-[#1DB188]">{accepted} accepted</span> · {rejected} rejected ·{' '}
              <span className="text-[#E85D4A]">{invalid} blocked</span> · {proposals.length - accepted - rejected - invalid} pending
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={acceptAllPending}
                disabled={!anyPending}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${darkMode ? 'bg-[#1DB188] text-white hover:bg-[#15946f]' : 'bg-ink text-white hover:bg-ink-soft'}`}
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={rejectAllPending}
                disabled={!anyPending}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${darkMode ? 'border-white/10 bg-surface/5 text-stone hover:bg-surface/10' : 'border-stone bg-surface text-muted-strong hover:bg-paper'}`}
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
              darkMode={darkMode}
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
  darkMode,
}: {
  proposal: Proposal;
  onAccept: () => void;
  onReject: () => void;
  darkMode: boolean;
}) {
  const badge =
    proposal.status === 'accepted'
      ? 'bg-[#1DB188] text-white'
      : proposal.status === 'rejected'
        ? darkMode
          ? 'bg-surface/10 text-muted-dark'
          : 'bg-stone text-muted'
        : proposal.status === 'invalid'
          ? 'bg-[#E85D4A] text-white'
          : 'bg-accent text-white';

  const shellState =
    proposal.status === 'accepted'
      ? darkMode
        ? 'border-[#1DB188]/30'
        : 'border-[#1DB188]/30'
      : proposal.status === 'invalid'
        ? darkMode
          ? 'border-[#E85D4A]/30'
          : 'border-[#E85D4A]/30'
        : darkMode
          ? 'border-white/10'
          : 'border-stone';

  return (
    <article className={`shell-outer rounded-[20px] border ${shellState} ${darkMode ? 'bg-surface/[0.03]' : 'bg-ink/[0.03]'}`}>
      <div className={`shell-inner rounded-[16px] p-3.5 ${darkMode ? 'bg-surface-dark-raised' : 'bg-surface'}`}>
        <header className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${badge}`}>{proposal.status}</span>
          <span className={`truncate font-mono text-xs font-medium ${darkMode ? 'text-stone' : 'text-ink'}`}>{proposal.targetId}</span>
        </header>

        <p className={`mt-2 text-xs leading-5 ${darkMode ? 'text-muted-dark' : 'text-muted-strong'}`}>{proposal.explanation}</p>

        <dl
          className={`mt-3 space-y-1 rounded-2xl border p-3 font-mono text-[11px] leading-5 ${darkMode ? 'border-white/10 bg-surface-dark text-muted-dark' : 'border-stone bg-paper text-muted-strong'}`}
          data-testid={`diff-${proposal.targetId}`}
        >
          {contentDiff(
            proposal.before.content as Record<string, unknown> | undefined,
            proposal.after.content as Record<string, unknown> | undefined,
            darkMode,
          )}
          {styleDiff(proposal.before.style as Record<string, unknown> | undefined, proposal.after.style as Record<string, unknown> | undefined, darkMode)}
        </dl>

        {proposal.invalidReason && (
          <p role="alert" className={`mt-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${darkMode ? 'bg-[#E85D4A]/15 text-[#FF9B8F] border border-[#E85D4A]/20' : 'bg-[#FFEDEA] text-[#B42318] border border-[#E85D4A]/15'}`}>
            {proposal.invalidReason}
          </p>
        )}

        <footer className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={proposal.status !== 'pending'}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'bg-[#1DB188] text-white hover:bg-[#15946f]' : 'bg-ink text-white hover:bg-ink-soft disabled:bg-stone disabled:text-muted-dark'}`}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={proposal.status !== 'pending'}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'border-white/10 bg-surface/5 text-stone hover:bg-surface/10' : 'border-stone bg-surface text-muted-strong hover:bg-paper'}`}
          >
            Reject
          </button>
        </footer>
      </div>
    </article>
  );
}

function contentDiff(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
  darkMode?: boolean,
): React.ReactNode[] {
  if (!after && !before) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const nodes: React.ReactNode[] = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (String(b) === String(a)) continue;
    nodes.push(
      <div key={`c-${key}`} className={darkMode ? 'text-muted-dark' : 'text-muted'}>
        <dt className={`inline font-bold ${darkMode ? 'text-stone' : 'text-ink'}`}>{key}: </dt>
        <dd className="inline">
          <span className={darkMode ? 'text-[#FF9B8F] line-through decoration-[#E85D4A]/40' : 'text-[#B42318] line-through decoration-[#E85D4A]/30'}>{String(truncate(b ?? '∅'))}</span>
          {' → '}
          <span className={darkMode ? 'text-[#6EE7B7] font-medium' : 'text-[#0E7A5B] font-medium'}>{String(truncate(a ?? '∅'))}</span>
        </dd>
      </div>,
    );
  }
  return nodes;
}

function styleDiff(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
  darkMode?: boolean,
): React.ReactNode[] {
  if (!after) return [];
  const keys = Object.keys(after);
  const nodes: React.ReactNode[] = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after[key];
    if (b === a) continue;
    nodes.push(
      <div key={`s-${key}`} className={darkMode ? 'text-muted-dark' : 'text-muted'}>
        <dt className={`inline font-bold ${darkMode ? 'text-stone' : 'text-ink'}`}>{key}: </dt>
        <dd className="inline">
          <span className={darkMode ? 'text-[#FF9B8F] line-through decoration-[#E85D4A]/40' : 'text-[#B42318] line-through decoration-[#E85D4A]/30'}>{b === undefined ? 'unset' : String(b)}</span>
          {' → '}
          <span className={darkMode ? 'text-[#6EE7B7] font-medium' : 'text-[#0E7A5B] font-medium'}>{String(a)}</span>
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
