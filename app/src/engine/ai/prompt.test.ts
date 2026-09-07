import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../../template/defaultTemplate';
import { STYLE_PROPS } from '../../types/template';
import type { DemoInput } from '../../types/proposal';
import { buildSystemPrompt, buildUserPrompt } from './prompt';

const doc = () => createDefaultTemplate();

const input = (overrides: Partial<DemoInput> = {}): DemoInput => ({
  instruction: 'Make the headline bolder',
  selectedIds: ['hero-heading'],
  scope: 'all',
  ...overrides,
});

describe('prompt assembly (spec ai-byok §6)', () => {
  it('system prompt states the JSON-only output contract', () => {
    const system = buildSystemPrompt();
    expect(system).toContain('"proposals"');
    expect(system).toMatch(/JSON/i);
  });

  it('system prompt lists the five command kinds and their fields', () => {
    const system = buildSystemPrompt();
    for (const kind of ['set-content', 'set-style', 'reorder', 'insert', 'remove']) {
      expect(system).toContain(kind);
    }
    expect(system).toContain('stylePatch');
    expect(system).toContain('parentId');
  });

  it('system prompt forbids engine-injected fields in commands', () => {
    const system = buildSystemPrompt();
    expect(system).toContain('baseRevision');
    expect(system).toContain('source');
    expect(system).toContain('scope');
  });

  it('system prompt lists the full 13-prop style allowlist', () => {
    const system = buildSystemPrompt();
    for (const prop of STYLE_PROPS) {
      expect(system).toContain(prop);
    }
    expect(system).toMatch(/hex/i);
  });

  it('system prompt states the exact content keys per element type', () => {
    const system = buildSystemPrompt();
    expect(system).toMatch(/heading.*text|text.*heading/s);
    expect(system).toContain('label');
    expect(system).toContain('href');
    expect(system).toContain('items');
    expect(system).toContain('brand');
    expect(system).toContain('links');
    expect(system).toContain('src');
    expect(system).toContain('alt');
  });

  it('system prompt states the URL safety policy', () => {
    const system = buildSystemPrompt();
    expect(system).toContain('https:');
    expect(system).toMatch(/javascript:/i);
  });

  it('system prompt requires id-targeting of known elements only', () => {
    const system = buildSystemPrompt();
    expect(system).toMatch(/targetId/i);
  });

  it('user prompt includes the instruction, scope and selected elements', () => {
    const prompt = buildUserPrompt(
      input({ instruction: 'Make the headline punchier', selectedIds: ['hero-heading'], scope: 'desktop' }),
      doc(),
    );
    expect(prompt).toContain('Make the headline punchier');
    expect(prompt).toContain('desktop');
    expect(prompt).toContain('hero-heading');
    expect(prompt).toContain('heading');
  });

  it('user prompt includes the resolved content of selected elements', () => {
    const d = doc();
    const headingContent = d.elements['hero-heading'].content.base as { text: string };
    const headingText = headingContent.text;
    expect(typeof headingText).toBe('string');
    const prompt = buildUserPrompt(input({ selectedIds: ['hero-heading'] }), d);
    expect(prompt).toContain(headingText as string);
  });

  it('user prompt supports multiple selected elements', () => {
    const prompt = buildUserPrompt(input({ selectedIds: ['hero-heading', 'hero-cta'] }), doc());
    expect(prompt).toContain('hero-heading');
    expect(prompt).toContain('hero-cta');
  });

  it('user prompt prints the scope literally for "all"', () => {
    expect(buildUserPrompt(input(), doc())).toContain('all');
  });

  it('user prompt includes a document inventory for targeting and insertion', () => {
    const prompt = buildUserPrompt(input(), doc());
    expect(prompt).toContain('footer-section');
    expect(prompt).toContain('section');
    expect(prompt).toContain('page-root');
  });

  it('user prompt includes resolved style data for selected elements', () => {
    const prompt = buildUserPrompt(input({ selectedIds: ['hero-heading'] }), doc());
    expect(prompt).toMatch(/fontSize|fontWeight/);
  });
});
