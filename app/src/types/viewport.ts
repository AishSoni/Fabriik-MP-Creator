export const VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const;

export type Viewport = (typeof VIEWPORTS)[number];

export type Scope = 'all' | Viewport;

export const VIEWPORT_WIDTH: Record<Viewport, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

export function isViewport(value: unknown): value is Viewport {
  return typeof value === 'string' && (VIEWPORTS as readonly string[]).includes(value);
}

export function isScope(value: unknown): value is Scope {
  return value === 'all' || isViewport(value);
}
