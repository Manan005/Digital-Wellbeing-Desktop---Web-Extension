/**
 * themeDom.ts
 * The browser side of theming: applies the effective theme to <html>, caches
 * the user's setting in localStorage for a flash-free first paint, and tracks
 * the OS preference. Never touches chrome.* so it works in `vite dev` too.
 */

import { useEffect, useState } from 'react';
import { readCachedTheme, resolveTheme, writeCachedTheme, type EffectiveTheme, type ThemeSetting } from './theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;

/** Sets data-theme on <html>; CSS in index.css does the rest (colours, color-scheme). */
export const applyTheme = (theme: EffectiveTheme): void => {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (el.dataset.theme !== theme) el.dataset.theme = theme;
};

export const cachedThemeSetting = (): ThemeSetting | null => readCachedTheme(safeLocalStorage());
export const cacheThemeSetting = (setting: ThemeSetting): void => writeCachedTheme(safeLocalStorage(), setting);

/** Call before the first render so neither the popup nor the dashboard flashes the wrong theme. */
export const bootTheme = (): void => {
  applyTheme(resolveTheme(cachedThemeSetting() ?? undefined, systemPrefersDark()));
};

/** Live OS preference; only matters while the setting is 'system'. */
export const usePrefersDark = (): boolean => {
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return prefersDark;
};
