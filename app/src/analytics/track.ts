/**
 * Minimal Umami analytics wrapper for hobby-project user stats.
 * No-ops in dev and when the tracker script is blocked or missing —
 * analytics must never break the app.
 */

interface UmamiTracker {
  track(eventName: string, data?: Record<string, unknown>): Promise<void>;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export function trackEvent(eventName: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.PROD) return;
  try {
    void window.umami?.track(eventName, data);
  } catch {
    // Ignore analytics failures.
  }
}
