export type ExampleCategory =
  | 'content'
  | 'style'
  | 'layout'
  | 'responsive'
  | 'multi-element'
  | 'failure';

export interface ExampleInstruction {
  instruction: string;
  description: string;
  category: ExampleCategory;
}

export const CATEGORY_ORDER: ExampleCategory[] = [
  'content',
  'style',
  'layout',
  'responsive',
  'multi-element',
  'failure',
];

export const CATEGORY_LABELS: Record<ExampleCategory, string> = {
  content: 'Content',
  style: 'Style',
  layout: 'Layout & size',
  responsive: 'Responsive scope',
  'multi-element': 'Multi-element',
  failure: 'Safe failures',
};

export const EXAMPLE_INSTRUCTIONS: ExampleInstruction[] = [
  { instruction: 'Rewrite the text to be more exciting', description: 'Rewrite copy', category: 'content' },
  { instruction: 'Shorten the headline', description: 'Shorten text', category: 'content' },
  { instruction: 'Make the background darker and the font bigger', description: 'Darker + bigger', category: 'style' },
  { instruction: 'Make this bolder', description: 'Bolder', category: 'style' },
  { instruction: 'Move this element up', description: 'Move up', category: 'layout' },
  { instruction: 'Make this wider', description: 'Wider', category: 'layout' },
  { instruction: 'On mobile make the font smaller', description: 'Mobile-only size', category: 'responsive' },
  { instruction: 'On tablet make the background lighter', description: 'Tablet-only shade', category: 'responsive' },
  { instruction: 'Make all selected elements bolder', description: 'Bold everything selected', category: 'multi-element' },
  { instruction: 'Change the templateId to something else', description: 'Forbidden field', category: 'failure' },
  { instruction: 'Now change the footer section too', description: 'Unselected target', category: 'failure' },
  { instruction: 'Simulate a stale revision conflict', description: 'Stale revision', category: 'failure' },
  { instruction: 'Tell me a joke about pixels', description: 'Unsupported ask', category: 'failure' },
];

export interface ExampleGroup {
  category: ExampleCategory;
  label: string;
  items: ExampleInstruction[];
}

function buildGroups(examples: ExampleInstruction[]): ExampleGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: examples.filter((example) => example.category === category),
  })).filter((group) => group.items.length > 0);
}

const DEFAULT_ORDER: ExampleCategory[] = [
  'content',
  'style',
  'layout',
  'responsive',
  'multi-element',
  'failure',
];

const MULTI_FIRST_ORDER: ExampleCategory[] = [
  'multi-element',
  'content',
  'style',
  'layout',
  'responsive',
  'failure',
];

export function groupExamples(
  examples: ExampleInstruction[] = EXAMPLE_INSTRUCTIONS,
  selectionCount = 1,
): ExampleGroup[] {
  const groups = buildGroups(examples);
  const order = selectionCount > 1 ? MULTI_FIRST_ORDER : DEFAULT_ORDER;
  return [...groups].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );
}
