import { describe, expect, it } from 'vitest';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { validateCommand } from './validate';
import type { EditCommand } from '../types/commands';

const doc = () => createDefaultTemplate();

const base = { source: 'canvas' as const, scope: 'all' as const };

describe('validateCommand', () => {
  it('accepts a valid set-style command', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      baseRevision: 0,
      stylePatch: { fontSize: 64 },
    });
    expect(errors).toEqual([]);
  });

  it('rejects unknown payloads', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      baseRevision: 0,
      stylePatch: { notAStyleProp: 12 },
    } as unknown as EditCommand);
    expect(errors[0]?.code).toBe('invalid-payload');
  });

  it('rejects unknown element ids', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-style',
      targetIds: ['nope'],
      baseRevision: 0,
      stylePatch: { fontSize: 10 },
    });
    expect(errors.some((e) => e.code === 'unknown-element')).toBe(true);
  });

  it('rejects stale revisions', () => {
    const d = doc();
    d.revision = 5;
    const errors = validateCommand(d, {
      ...base,
      kind: 'set-style',
      targetIds: ['hero-heading'],
      baseRevision: 3,
      stylePatch: { fontSize: 10 },
    });
    expect(errors.some((e) => e.code === 'stale-revision')).toBe(true);
  });

  it('rejects content that does not match the element type', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'set-content',
      targetIds: ['hero-cta'],
      baseRevision: 0,
      content: { text: 'hello' },
    });
    expect(errors[0]?.code).toBe('invalid-payload');
  });

  it('rejects removing the page root', () => {
    const errors = validateCommand(doc(), {
      ...base,
      kind: 'remove',
      targetIds: ['page-root'],
      baseRevision: 0,
    });
    expect(errors.some((e) => e.code === 'forbidden-field')).toBe(true);
  });

  it('rejects insert into non-section parent and colliding ids', () => {
    const d = doc();
    const element = JSON.parse(JSON.stringify(d.elements['footer-text']));
    const errors = validateCommand(d, {
      ...base,
      kind: 'insert',
      targetIds: [],
      baseRevision: 0,
      parentId: 'hero-heading',
      index: 0,
      element,
    });
    expect(errors.some((e) => e.code === 'invalid-target')).toBe(true);

    const errors2 = validateCommand(d, {
      ...base,
      kind: 'insert',
      targetIds: [],
      baseRevision: 0,
      parentId: 'features-section',
      index: 0,
      element,
    });
    expect(errors2.some((e) => e.code === 'id-collision')).toBe(true);
  });
});
