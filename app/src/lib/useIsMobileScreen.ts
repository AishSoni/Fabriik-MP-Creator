import { useSyncExternalStore } from 'react';

export function isMobileScreenWidth(breakpoint = 768): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
}

export function useIsMobileScreen(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => {
        mql.removeEventListener('change', onChange);
      };
    },
    () => isMobileScreenWidth(breakpoint),
    () => false,
  );
}
