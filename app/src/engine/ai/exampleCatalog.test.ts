import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_INSTRUCTIONS,
  groupExamples,
  CATEGORY_LABELS,
  type ExampleCategory,
} from './exampleCatalog';

describe('example catalog', () => {
  it('categorizes every documented example', () => {
    const valid: ExampleCategory[] = Object.keys(CATEGORY_LABELS) as ExampleCategory[];
    for (const example of EXAMPLE_INSTRUCTIONS) {
      expect(valid).toContain(example.category);
      expect(example.instruction.length).toBeGreaterThan(0);
      expect(example.description.length).toBeGreaterThan(0);
    }
  });

  it('covers all five success paths and at least one safe failure', () => {
    const categories = new Set(EXAMPLE_INSTRUCTIONS.map((e) => e.category));
    expect(categories.has('content')).toBe(true);
    expect(categories.has('style')).toBe(true);
    expect(categories.has('layout')).toBe(true);
    expect(categories.has('responsive')).toBe(true);
    expect(categories.has('multi-element')).toBe(true);
    expect(categories.has('failure')).toBe(true);
  });

  it('groups examples with failures last by default', () => {
    const groups = groupExamples();
    expect(groups.at(-1)?.category).toBe('failure');
    expect(groups.find((g) => g.category === 'content')?.items.length).toBeGreaterThan(0);
  });

  it('promotes multi-element examples to the front when several elements are selected', () => {
    const groups = groupExamples(EXAMPLE_INSTRUCTIONS, 2);
    expect(groups[0].category).toBe('multi-element');
    expect(groups.at(-1)?.category).toBe('failure');
  });
});
