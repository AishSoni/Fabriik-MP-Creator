import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AI_OUTPUT_JSON_SCHEMA, aiOutputSchema } from './outputSchema';

const setStyleProposal = {
  targetId: 'hero-heading',
  explanation: 'Bolder headline.',
  before: { style: { fontWeight: 400 } },
  after: { style: { fontWeight: 800 } },
  command: {
    kind: 'set-style',
    targetIds: ['hero-heading'],
    stylePatch: { fontWeight: 800 },
  },
};

const setContentProposal = {
  targetId: 'hero-cta',
  explanation: 'Punchier label.',
  before: { content: { label: 'Get started', href: '#pricing' } },
  after: { content: { label: 'Try it free', href: '#pricing' } },
  command: {
    kind: 'set-content',
    targetIds: ['hero-cta'],
    content: { label: 'Try it free', href: '#pricing' },
  },
};

const reorderProposal = {
  targetId: 'hero-eyebrow',
  explanation: 'Move eyebrow down one slot.',
  command: { kind: 'reorder', targetIds: ['hero-eyebrow'], index: 1 },
};

const removeProposal = {
  targetId: 'hero-eyebrow',
  explanation: 'Remove the eyebrow.',
  command: { kind: 'remove', targetIds: ['hero-eyebrow'] },
};

const insertProposal = {
  targetId: 'cta-note',
  explanation: 'Add a closing note.',
  command: {
    kind: 'insert',
    parentId: 'cta-section',
    index: 0,
    element: {
      id: 'cta-note',
      type: 'text',
      parentId: 'cta-section',
      childIds: [],
      content: { base: { text: 'No credit card required.' } },
      style: { base: {} },
    },
  },
};

describe('aiOutputSchema (spec ai-byok §6, decision 8)', () => {
  it('accepts a payload containing all five command kinds', () => {
    const result = aiOutputSchema.safeParse({
      proposals: [setStyleProposal, setContentProposal, reorderProposal, removeProposal, insertProposal],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty proposals array', () => {
    const result = aiOutputSchema.safeParse({ proposals: [] });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown style prop (13-prop allowlist)', () => {
    const result = aiOutputSchema.safeParse({
      proposals: [
        {
          ...setStyleProposal,
          command: { ...setStyleProposal.command, stylePatch: { color: '#111111', cursor: 'pointer' } },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-hex color', () => {
    const result = aiOutputSchema.safeParse({
      proposals: [
        {
          ...setStyleProposal,
          command: { ...setStyleProposal.command, stylePatch: { color: 'red' } },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unsafe URL in button href', () => {
    const result = aiOutputSchema.safeParse({
      proposals: [
        {
          ...setContentProposal,
          command: {
            ...setContentProposal.command,
            content: { label: 'Gotcha', href: 'javascript:alert(1)' },
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra top-level keys (strict object)', () => {
    const result = aiOutputSchema.safeParse({ proposals: [setStyleProposal], templateId: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a proposal with extra keys (strict object)', () => {
    const result = aiOutputSchema.safeParse({
      proposals: [{ ...setStyleProposal, baseRevision: 3 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array proposals payloads', () => {
    expect(aiOutputSchema.safeParse({ proposals: 'all of them' }).success).toBe(false);
    expect(aiOutputSchema.safeParse({ proposals: null }).success).toBe(false);
    expect(aiOutputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a proposal whose command has an unknown kind', () => {
    const result = aiOutputSchema.safeParse({
      proposals: [{ ...setStyleProposal, command: { kind: 'teleport', targetIds: ['x'] } }],
    });
    expect(result.success).toBe(false);
  });

  it('exposes the derived JSON Schema as the single source of truth', () => {
    const derived = z.toJSONSchema(aiOutputSchema);
    expect(AI_OUTPUT_JSON_SCHEMA).toEqual(derived);
    expect(AI_OUTPUT_JSON_SCHEMA).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({ proposals: expect.anything() }),
    });
  });
});
