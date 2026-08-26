import type { Viewport } from './viewport';

export interface StyleProps {
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
  marginBottom?: number;
  widthPercent?: number;
  height?: number;
  borderRadius?: number;
}

export type StylePatch = Partial<StyleProps>;
export type StyleOverrides = Partial<Record<Viewport, StylePatch>>;

export interface ScopedStyle {
  base: StyleProps;
  overrides?: StyleOverrides;
}

const STYLE_KEYS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'color',
  'backgroundColor',
  'paddingX',
  'paddingY',
  'marginTop',
  'marginBottom',
  'widthPercent',
  'height',
  'borderRadius',
] as const satisfies readonly (keyof StyleProps)[];

export const STYLE_PROPS: ReadonlySet<string> = new Set(STYLE_KEYS);

export interface HeadingContent {
  text: string;
}

export interface TextContent {
  text: string;
}

export interface ButtonContent {
  label: string;
  href: string;
}

export interface ImageContent {
  src: string;
  alt: string;
}

export interface ListContent {
  items: string[];
}

export interface NavContent {
  brand: string;
  links: { label: string; href: string }[];
}

export interface SectionContent {}

export type ElementContent =
  | HeadingContent
  | TextContent
  | ButtonContent
  | ImageContent
  | ListContent
  | NavContent
  | SectionContent;

export type ElementType =
  | 'section'
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'list'
  | 'nav';

export interface ContentOverrides {
  overrides?: Partial<Record<Viewport, ElementContent>>;
}

export interface ScopedContent extends ContentOverrides {
  base: ElementContent;
}

export type ElementId = string;

export interface TemplateElement {
  id: ElementId;
  type: ElementType;
  parentId: ElementId | null;
  childIds: ElementId[];
  content: ScopedContent;
  style: ScopedStyle;
}

export interface TemplateDoc {
  templateId: string;
  templateName: string;
  revision: number;
  rootId: ElementId;
  elements: Record<ElementId, TemplateElement>;
}

export function defaultContentFor(type: ElementType): ElementContent {
  switch (type) {
    case 'heading':
      return { text: '' };
    case 'text':
      return { text: '' };
    case 'button':
      return { label: '', href: '#' };
    case 'image':
      return { src: '', alt: '' };
    case 'list':
      return { items: [] };
    case 'nav':
      return { brand: '', links: [] };
    case 'section':
      return {};
  }
}
