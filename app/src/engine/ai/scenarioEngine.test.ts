import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../../template/defaultTemplate';
import { runDemoEngine, EXAMPLE_INSTRUCTIONS } from './scenarioEngine';
import { validateCommand } from '../validate';
import { commitCommand } from '../commit';
import { resolveTree } from '../resolve';

const doc = () => createDefaultTemplate();

describe('runDemoEngine', () => {
  it('is deterministic: same input and state produce identical results', () => {
    const d = doc();
    const input = { instruction: 'Rewrite the text to be more exciting', selectedIds: ['hero-heading'], scope: 'all' as const };
    expect(JSON.stringify(runDemoEngine(input, d))).toEqual(JSON.stringify(runDemoEngine(input, d)));
  });

  it('proposals only reference selected element ids', () => {
    const d = doc();
    const result = runDemoEngine(
      { instruction: 'Make the background darker and the font bigger', selectedIds: ['hero-section', 'hero-heading'], scope: 'all' },
      d,
    );
    expect(result.proposals.length).toBeGreaterThan(0);
    for (const proposal of result.proposals) {
      expect(['hero-section', 'hero-heading']).toContain(proposal.targetId);
    }
  });

  it('every pending proposal command passes runtime validation', () => {
    const d = doc();
    const result = runDemoEngine(
      { instruction: 'Rewrite the text to be more exciting', selectedIds: ['hero-heading', 'hero-subtext'], scope: 'tablet' },
      d,
    );
    for (const proposal of result.proposals) {
      if (proposal.status === 'invalid') throw new Error(`unexpected invalid proposal: ${proposal.invalidReason}`);
      expect(validateCommand(d, proposal.command)).toEqual([]);
    }
  });

  it('style patches only touch allowed style fields', () => {
    const allowed = new Set(['fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'color', 'backgroundColor', 'paddingX', 'paddingY', 'marginTop', 'marginBottom', 'widthPercent', 'height', 'borderRadius']);
    const d = doc();
    const result = runDemoEngine(
      { instruction: 'Make the background darker and the font bigger', selectedIds: ['hero-section'], scope: 'all' },
      d,
    );
    for (const proposal of result.proposals) {
      if (proposal.command.kind === 'set-style') {
        for (const key of Object.keys(proposal.command.stylePatch)) {
          expect(allowed.has(key)).toBe(true);
        }
      }
    }
  });

  it('a mobile-named instruction produces mobile-scoped proposals that leave desktop untouched when applied', () => {
    let d = doc();
    const beforeDesktop = resolveTree(d, 'desktop');
    const result = runDemoEngine(
      { instruction: 'On mobile make the font smaller', selectedIds: ['hero-heading'], scope: 'all' },
      d,
    );
    expect(result.error).toBeUndefined();
    for (const proposal of result.proposals) {
      expect(proposal.command.scope).toBe('mobile');
      if (proposal.status !== 'invalid') {
        d = commitCommand(d, {}, proposal.command).doc;
      }
    }
    expect(resolveTree(d, 'desktop').get('hero-heading')?.style.fontSize).toBe(
      beforeDesktop.get('hero-heading')?.style.fontSize,
    );
    expect(resolveTree(d, 'mobile').get('hero-heading')?.style.fontSize).not.toEqual(
      beforeDesktop.get('hero-heading')?.style.fontSize,
    );
  });

  it('multi-element instructions generate one independent proposal per selected element', () => {
    const d = doc();
    const result = runDemoEngine(
      { instruction: 'Make all selected elements bolder', selectedIds: ['feature-1-title', 'feature-2-title'], scope: 'all' },
      d,
    );
    expect(result.proposals.map((p) => p.targetId).sort()).toEqual(['feature-1-title', 'feature-2-title']);
  });

  it('uses current live values, not fixed replacements', () => {
    let d = doc();
    d = commitCommand(d, {}, {
      kind: 'set-content',
      source: 'canvas',
      targetIds: ['hero-heading'],
      scope: 'all',
      baseRevision: 0,
      content: { text: 'fresh value from canvas' },
    }).doc;
    const result = runDemoEngine(
      { instruction: 'Rewrite the text to be more exciting', selectedIds: ['hero-heading'], scope: 'all' },
      d,
    );
    const after = result.proposals[0].after.content as { text: string };
    expect(after.text.toLowerCase()).toContain('fresh value from canvas');
  });

  describe('safe failure paths', () => {
    it('rejects forbidden fields', () => {
      const result = runDemoEngine(
        { instruction: 'Change the templateId to something else', selectedIds: ['hero-heading'], scope: 'all' },
        doc(),
      );
      expect(result.error?.code).toBe('forbidden-field');
      expect(result.proposals).toHaveLength(0);
    });

    it('rejects unselected targets', () => {
      const result = runDemoEngine(
        { instruction: 'Now change the footer section too', selectedIds: ['hero-heading'], scope: 'all' },
        doc(),
      );
      expect(result.error?.code).toBe('unselected-target');
      expect(result.error?.message).toContain('footer-section');
    });

    it('simulates a stale revision and marks proposals invalid so nothing applies', () => {
      let d = doc();
      d = commitCommand(d, {}, {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        baseRevision: 0,
        stylePatch: { color: '#000000' },
      }).doc;
      const revisionBefore = d.revision;
      const result = runDemoEngine(
        { instruction: 'Simulate a stale revision conflict', selectedIds: ['hero-heading'], scope: 'all' },
        d,
      );
      expect(result.proposals.length).toBeGreaterThan(0);
      for (const proposal of result.proposals) {
        expect(proposal.status).toBe('invalid');
        expect(proposal.invalidReason).toContain('stale-revision');
        expect(validateCommand(d, proposal.command).some((e) => e.code === 'stale-revision')).toBe(true);
      }
      expect(d.revision).toBe(revisionBefore);
    });

    it('reports unsupported instructions', () => {
      const result = runDemoEngine(
        { instruction: 'Tell me a joke about pixels', selectedIds: ['hero-heading'], scope: 'all' },
        doc(),
      );
      expect(result.error?.code).toBe('unsupported-instruction');
    });
  });

  it('covers all documented example paths without throwing', () => {
    const d = doc();
    for (const example of EXAMPLE_INSTRUCTIONS) {
      const selection = example.description.startsWith('Multi-element')
        ? ['feature-1-title', 'feature-2-title']
        : ['hero-heading'];
      expect(() => runDemoEngine({ instruction: example.instruction, selectedIds: selection, scope: 'all' }, d)).not.toThrow();
    }
  });
});
