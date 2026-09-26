/**
 * theme.ts
 * Pure theme logic (no DOM, no chrome.*) so it can be unit-tested and shared
 * by the boot code, the settings UI and the storage types.
 *
 * `ThemeSetting` is what the user chose; `EffectiveTheme` is what gets drawn.
 */

export type ThemeSetting = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

export const DEFAULT_THEME: ThemeSetting = 'system';

/** localStorage key holding the last known setting, for a flash-free first paint. */
export const THEME_CACHE_KEY = 'dw.theme';

export const isThemeSetting = (v: unknown): v is ThemeSetting => v === 'system' || v === 'light' || v === 'dark';

export const resolveTheme = (setting: ThemeSetting | undefined, prefersDark: boolean): EffectiveTheme =>
  setting === 'light' || setting === 'dark' ? setting : prefersDark ? 'dark' : 'light';

/** What a quick toggle should set, given what is currently shown. */
export const toggledSetting = (effective: EffectiveTheme): ThemeSetting => (effective === 'dark' ? 'light' : 'dark');

/** The subset of the Storage interface we rely on (localStorage or a test fake). */
export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const readCachedTheme = (store: KVStore | null | undefined): ThemeSetting | null => {
  try {
    const v = store?.getItem(THEME_CACHE_KEY);
    return isThemeSetting(v) ? v : null;
  } catch {
    return null;
  }
};

export const writeCachedTheme = (store: KVStore | null | undefined, setting: ThemeSetting): void => {
  try {
    store?.setItem(THEME_CACHE_KEY, setting);
  } catch {
    // Private mode / blocked storage: the cache is only an optimisation
  }
};
