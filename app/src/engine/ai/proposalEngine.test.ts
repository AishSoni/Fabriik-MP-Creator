import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../../template/defaultTemplate';
import { runDemoEngine } from './scenarioEngine';
import { demoProposalEngine } from './demoEngine';
import type { ProposalEngine, ProposalEngineId } from './proposalEngine';
import type { DemoInput, DemoResult } from '../../types/proposal';

const doc = () => createDefaultTemplate();

const input = (overrides: Partial<DemoInput> = {}): DemoInput => ({
  instruction: 'Make the heading bolder',
  selectedIds: ['hero-heading'],
  scope: 'all',
  ...overrides,
});

describe('ProposalEngine seam (spec ai-byok §6)', () => {
  it('demo engine satisfies the engine contract', () => {
    const engine: ProposalEngine = demoProposalEngine;
    expect(engine.id).toBe<ProposalEngineId>('demo');
    expect(engine.label.length).toBeGreaterThan(0);
    expect(typeof engine.run).toBe('function');
  });

  it('resolves to the same deterministic result as the sync demo engine', async () => {
    const result: DemoResult = await demoProposalEngine.run(input(), doc());
    expect(result).toEqual(runDemoEngine(input(), doc()));
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('passes demo error results through unchanged', async () => {
    const result = await demoProposalEngine.run(input({ instruction: 'gibberish nonsense' }), doc());
    expect(result.proposals).toEqual([]);
    expect(result.error?.code).toBe('unsupported-instruction');
  });
});
