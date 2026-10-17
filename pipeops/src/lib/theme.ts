import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'pipeops-theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let current: Theme = read();

/** Applies the saved theme to <html data-theme>; also done by an inline script in
 *  index.html before first paint so there is no flash. Dark stays the default. */
export function applyTheme(t: Theme) {
  current = t;
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable, theme just won't persist */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Hex values for the few colours framer-motion animates (it can't tween CSS variables). */
export const ANIMATED = {
  dark: { signal: '#C8FF4D', bg: '#0A0B0D', line: '#6B707C', off: '#1A1B20', on: '#B9BDC6', cost: '#FF7A52' },
  light: { signal: '#4D7C0F', bg: '#F7F7F5', line: '#74746F', off: '#E8E8E4', on: '#3A3A36', cost: '#C2410C' },
} as const;
