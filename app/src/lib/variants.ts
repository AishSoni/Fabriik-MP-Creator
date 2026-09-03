import { cva } from 'class-variance-authority';

/**
 * variants — single source of truth for repeated pill/tab/badge patterns.
 * Keeps conditional Tailwind out of TSX and makes darkMode handling explicit.
 *
 * Pattern: base → variants → compoundVariants (dark + active).
 * All colors use @theme tokens (ink/paper/accent/stone) — never arbitrary hex.
 */

// Right-panel tabs / segmented controls (EditorShell, PropertiesPanel align, TopBar viewport)
export const pillTriggerVariants = cva(
  'cursor-pointer rounded-pill px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]',
  {
    variants: {
      active: {
        true: 'shadow-sm',
        false: '',
      },
      dark: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      { active: true, dark: true, class: 'bg-paper text-ink' },
      { active: true, dark: false, class: 'bg-ink text-white' },
      { active: false, dark: true, class: 'text-muted-dark hover:bg-white/10 hover:text-white' },
      { active: false, dark: false, class: 'text-muted hover:bg-surface hover:text-ink' },
    ],
    defaultVariants: { active: false, dark: false },
  },
);

// More specific tab used in EditorShell (slightly different hover + full-width)
export const editorTabVariants = cva(
  'flex-1 cursor-pointer rounded-pill px-3 py-1.5 text-[12px] font-semibold tracking-wide transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
  {
    variants: {
      active: { true: 'shadow-[0_2px_8px_rgba(14,14,16,0.12)]', false: '' },
      dark: { true: '', false: '' },
    },
    compoundVariants: [
      { active: true, dark: true, class: 'bg-paper text-ink' },
      { active: true, dark: false, class: 'bg-ink text-white' },
      { active: false, dark: true, class: 'text-muted-dark hover:bg-white/[0.06] hover:text-paper' },
      { active: false, dark: false, class: 'text-muted hover:bg-ink/[0.06] hover:text-ink' },
    ],
    defaultVariants: { active: false, dark: false },
  },
);

// Viewport segmented pills (TopBar)
export const viewportPillVariants = cva(
  'cursor-pointer rounded-pill px-3 py-1 text-[13px] font-medium transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
  {
    variants: {
      active: { true: 'shadow-sm', false: '' },
      dark: { true: '', false: '' },
    },
    compoundVariants: [
      { active: true, dark: true, class: 'bg-paper text-ink' },
      { active: true, dark: false, class: 'bg-ink text-white' },
      { active: false, dark: true, class: 'text-muted-dark hover:text-paper' },
      { active: false, dark: false, class: 'text-muted hover:text-ink' },
    ],
    defaultVariants: { active: false, dark: false },
  },
);

// Badge for history source (HistoryPanel)
export const historyBadgeVariants = cva(
  'inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em]',
  {
    variants: {
      source: {
        canvas: '',
        code: '',
        ai: '',
        restore: '',
        fallback: '',
      },
      dark: { true: '', false: '' },
    },
    compoundVariants: [
      { source: 'canvas', dark: false, class: 'bg-stone text-muted-strong' },
      { source: 'canvas', dark: true, class: 'bg-white/10 text-muted-dark' },
      { source: 'code', dark: false, class: 'bg-[#FCE8C3] text-[#8A5A00]' },
      { source: 'code', dark: true, class: 'bg-amber-500/15 text-amber-200' },
      { source: 'ai', dark: false, class: 'bg-accent-soft text-accent-strong' },
      { source: 'ai', dark: true, class: 'bg-accent/20 text-accent-ring' },
      { source: 'restore', dark: false, class: 'bg-[#D1F0E6] text-[#0E7A5B]' },
      { source: 'restore', dark: true, class: 'bg-emerald-500/15 text-emerald-200' },
      { source: 'fallback', dark: false, class: 'bg-stone text-muted' },
      { source: 'fallback', dark: true, class: 'bg-white/10 text-muted-dark' },
    ],
    defaultVariants: { source: 'fallback', dark: false },
  },
);

// Card shell used by PropertiesPanel, AiDemoPanel, History entries
export const cardVariants = cva('rounded-[20px] border', {
  variants: {
    tone: {
      default: 'border-stone bg-surface shadow-sm',
      muted: 'border-stone bg-paper',
      dark: 'border-white/10 bg-surface-dark-raised',
      subtleDark: 'border-white/10 bg-white/[0.04]',
    },
  },
  defaultVariants: { tone: 'default' },
});

// Input shell — shared by PropertiesPanel fields, AiDemo textarea, CodePanel
export const inputVariants = cva(
  'w-full border transition-colors duration-200 placeholder:text-muted-dark focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
  {
    variants: {
      shape: {
        pill: 'rounded-pill px-3.5 py-2 text-sm font-medium tabular-nums',
        rounded: 'rounded-2xl px-3.5 py-3 text-[14px] leading-6',
        code: 'rounded-2xl px-3.5 py-3 font-mono text-xs leading-5',
      },
      dark: { true: 'border-white/10 bg-surface-dark text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]', false: '' },
    },
    compoundVariants: [
      // light tones per shape
      { shape: 'pill', dark: false, class: 'border-stone bg-paper text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus:bg-surface' },
      { shape: 'rounded', dark: false, class: 'border-stone bg-surface text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]' },
      { shape: 'code', dark: false, class: 'border-stone bg-paper text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]' },
    ],
    defaultVariants: { shape: 'pill', dark: false },
  },
);

// Button — primary/secondary/ghost
export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white shadow-accent hover:bg-accent-strong',
        darkPrimary: 'bg-accent text-white shadow-accent hover:bg-accent-strong',
        solidDark: 'bg-ink text-white hover:bg-ink-soft shadow-sm',
        solidLight: 'bg-paper text-ink hover:bg-surface shadow-sm',
        ghostDark: 'bg-white/5 text-paper hover:bg-white/10 border border-white/10',
        ghostLight: 'bg-surface text-ink hover:bg-paper border border-stone shadow-sm',
        subtle: 'text-muted hover:text-ink hover:bg-surface-muted',
        subtleDark: 'text-muted-dark hover:text-paper hover:bg-white/10',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-3.5 py-1.5 text-xs',
        lg: 'px-4 py-3 text-sm',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'solidDark', size: 'md' },
  },
);
