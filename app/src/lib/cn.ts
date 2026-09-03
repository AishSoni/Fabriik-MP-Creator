import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — merges Tailwind classes safely.
 * - `clsx` handles conditional logic (`cn("a", isActive && "b", { hidden: !open })`)
 * - `twMerge` deduplicates conflicting Tailwind utilities (`cn("px-2 px-4") → "px-4"`)
 *
 * Usage: `className={cn("rounded-full border px-3", darkMode ? "bg-surface-dark" : "bg-surface", className)}`
 * Order: base → variants → conditionals → user overrides (last wins via twMerge).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
