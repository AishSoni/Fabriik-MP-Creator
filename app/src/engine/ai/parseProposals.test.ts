import { describe, expect, it } from 'vitest';
import { defaultContentFor } from '../../types/template';
import { ProposalParseError, parseProposals } from './parseProposals';

const setStylePayload = JSON.stringify({
  proposals: [
    {
      targetId: 'hero-heading',
      explanation: 'Bolder headline.',
      before: { style: { fontWeight: 400 } },
      after: { style: { fontWeight: 800 } },
      command: {
        kind: 'set-style',
        targetIds: ['hero-heading'],
        stylePatch: { fontWeight: 800 },
      },
    },
  ],
});

describe('parseProposals (spec ai-byok §6, §10)', () => {
  it('maps a valid set-content payload to RawProposal[] with source and scope injected', () => {
    const text = JSON.stringify({
      proposals: [
        {
          targetId: 'hero-cta',
          explanation: 'Punchier label.',
          before: { content: { label: 'Get started', href: '#pricing' } },
          after: { content: { label: 'Try it free', href: '#pricing' } },
          command: {
            kind: 'set-content',
            targetIds: ['hero-cta'],
            content: { label: 'Try it free', href: '#pricing' },
          },
        },
      ],
    });
    const raws = parseProposals(text, 'mobile');
    expect(raws).toHaveLength(1);
    const raw = raws[0];
    expect(raw.targetId).toBe('hero-cta');
    expect(raw.explanation).toBe('Punchier label.');
    expect(raw.before).toEqual({ content: { label: 'Get started', href: '#pricing' } });
    expect(raw.after).toEqual({ content: { label: 'Try it free', href: '#pricing' } });
    expect(raw.command).toEqual({
      kind: 'set-content',
      source: 'ai',
      targetIds: ['hero-cta'],
      scope: 'mobile',
      content: { label: 'Try it free', href: '#pricing' },
    });
    expect('baseRevision' in raw.command).toBe(false);
  });

  it('passes set-style commands through with injected source and scope', () => {
    const raws = parseProposals(setStylePayload, 'all');
    expect(raws[0].command).toEqual({
      kind: 'set-style',
      source: 'ai',
      targetIds: ['hero-heading'],
      scope: 'all',
      stylePatch: { fontWeight: 800 },
    });
  });

  it('maps reorder, remove and insert commands', () => {
    const text = JSON.stringify({
      proposals: [
        { targetId: 'a', explanation: 'r', command: { kind: 'reorder', targetIds: ['a'], index: 2 } },
        { targetId: 'b', explanation: 'x', command: { kind: 'remove', targetIds: ['b'] } },
        {
          targetId: 'cta-note',
          explanation: 'i',
          command: {
            kind: 'insert',
            parentId: 'cta-section',
            index: 0,
            element: {
              id: 'cta-note',
              type: 'text',
              parentId: 'cta-section',
              childIds: [],
              style: { base: {} },
            },
          },
        },
      ],
    });
    const raws = parseProposals(text, 'desktop');
    expect(raws[0].command).toMatchObject({ kind: 'reorder', targetIds: ['a'], index: 2, scope: 'desktop', source: 'ai' });
    expect(raws[1].command).toMatchObject({ kind: 'remove', targetIds: ['b'], scope: 'desktop', source: 'ai' });
    const insert = raws[2].command as { kind: string; targetIds: unknown[]; element: { content: { base: unknown } } };
    expect(insert.kind).toBe('insert');
    expect(insert.targetIds).toEqual([]);
    expect(insert.element.content.base).toEqual(defaultContentFor('text'));
  });

  it('returns an empty array for an empty proposals list', () => {
    expect(parseProposals('{"proposals":[]}', 'all')).toEqual([]);
  });

  it('parses JSON wrapped in a ```json fence (prompt-only providers)', () => {
    const raws = parseProposals('```json\n' + setStylePayload + '\n```', 'all');
    expect(raws).toHaveLength(1);
    expect(raws[0].command).toMatchObject({ kind: 'set-style', stylePatch: { fontWeight: 800 } });
  });

  it('parses JSON wrapped in a plain ``` fence', () => {
    const raws = parseProposals('```\n' + setStylePayload + '\n```', 'all');
    expect(raws).toHaveLength(1);
  });

  it('parses JSON embedded in surrounding prose', () => {
    const raws = parseProposals('Here are the edits you asked for:\n' + setStylePayload + '\nLet me know if you want more.', 'all');
    expect(raws).toHaveLength(1);
    expect(raws[0].command).toMatchObject({ kind: 'set-style', stylePatch: { fontWeight: 800 } });
  });

  it('still throws provider-parse when no JSON object is present', () => {
    expect(() => parseProposals('no JSON here at all', 'all')).toThrow(ProposalParseError);
    expect(() => parseProposals('', 'all')).toThrow(ProposalParseError);
  });

  it('still throws provider-parse for broken JSON inside a fence', () => {
    expect(() => parseProposals('```json\n{"proposals":[\n```', 'all')).toThrow(ProposalParseError);
  });

  it('preserves proposal order', () => {
    const text = JSON.stringify({
      proposals: [
        { targetId: 'a', explanation: 'first', command: { kind: 'remove', targetIds: ['a'] } },
        { targetId: 'b', explanation: 'second', command: { kind: 'remove', targetIds: ['b'] } },
      ],
    });
    const raws = parseProposals(text, 'all');
    expect(raws.map((r) => r.targetId)).toEqual(['a', 'b']);
  });

  it('throws ProposalParseError with code provider-parse for malformed JSON', () => {
    try {
      parseProposals('{"proposals":[', 'all');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProposalParseError);
      expect((error as ProposalParseError).code).toBe('provider-parse');
    }
  });

  it('throws provider-parse for a non-object JSON payload', () => {
    expect(() => parseProposals('[1,2,3]', 'all')).toThrow(ProposalParseError);
  });

  it('throws provider-parse when proposals is not an array', () => {
    expect(() => parseProposals('{"proposals":"everything"}', 'all')).toThrow(ProposalParseError);
    expect(() => parseProposals('{"proposals":null}', 'all')).toThrow(ProposalParseError);
    expect(() => parseProposals('{}', 'all')).toThrow(ProposalParseError);
  });

  it('throws provider-parse when a proposal omits its command', () => {
    const text = JSON.stringify({
      proposals: [{ targetId: 'hero-heading', explanation: 'no command' }],
    });
    try {
      parseProposals(text, 'all');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProposalParseError);
      expect((error as ProposalParseError).code).toBe('provider-parse');
    }
  });

  it('throws provider-parse for schema-level command violations', () => {
    const unknownStyleProp = JSON.stringify({
      proposals: [
        {
          targetId: 'hero-heading',
          explanation: 'bad patch',
          command: { kind: 'set-style', targetIds: ['hero-heading'], stylePatch: { cursor: 'pointer' } },
        },
      ],
    });
    expect(() => parseProposals(unknownStyleProp, 'all')).toThrow(ProposalParseError);

    const unsafeHref = JSON.stringify({
      proposals: [
        {
          targetId: 'hero-cta',
          explanation: 'bad href',
          command: { kind: 'set-content', targetIds: ['hero-cta'], content: { label: 'x', href: 'javascript:alert(1)' } },
        },
      ],
    });
    expect(() => parseProposals(unsafeHref, 'all')).toThrow(ProposalParseError);
  });
});
