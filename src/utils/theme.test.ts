import { describe, it, expect } from 'vitest';
import {
  resolveTheme,
  isThemeSetting,
  toggledSetting,
  readCachedTheme,
  writeCachedTheme,
  THEME_CACHE_KEY,
  type KVStore,
} from './theme';
import { DEFAULT_GLOBAL_SETTINGS } from './storage';

const fakeStore = (initial: Record<string, string> = {}): KVStore & { map: Map<string, string> } => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
};

describe('resolveTheme', () => {
  it.each([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    [undefined, true, 'dark'],
    [undefined, false, 'light'],
  ] as const)('%s + prefersDark=%s → %s', (setting, prefersDark, expected) => {
    expect(resolveTheme(setting, prefersDark)).toBe(expected);
  });
});

describe('isThemeSetting / toggledSetting', () => {
  it('accepts only the three settings', () => {
    expect(isThemeSetting('system')).toBe(true);
    expect(isThemeSetting('light')).toBe(true);
    expect(isThemeSetting('dark')).toBe(true);
    expect(isThemeSetting('auto')).toBe(false);
    expect(isThemeSetting(null)).toBe(false);
    expect(isThemeSetting(1)).toBe(false);
  });

  it('flips the effective theme into an explicit setting', () => {
    expect(toggledSetting('dark')).toBe('light');
    expect(toggledSetting('light')).toBe('dark');
  });
});

describe('theme cache', () => {
  it('reads a valid cached setting', () => {
    expect(readCachedTheme(fakeStore({ [THEME_CACHE_KEY]: 'dark' }))).toBe('dark');
  });

  it('returns null for missing, garbage, or no store', () => {
    expect(readCachedTheme(fakeStore())).toBeNull();
    expect(readCachedTheme(fakeStore({ [THEME_CACHE_KEY]: 'blue' }))).toBeNull();
    expect(readCachedTheme(null)).toBeNull();
  });

  it('survives a throwing store', () => {
    const throwing: KVStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readCachedTheme(throwing)).toBeNull();
    expect(() => writeCachedTheme(throwing, 'dark')).not.toThrow();
  });

  it('writes the setting', () => {
    const store = fakeStore();
    writeCachedTheme(store, 'light');
    expect(store.map.get(THEME_CACHE_KEY)).toBe('light');
  });
});

describe('defaults', () => {
  it('new installs follow the system theme', () => {
    expect(DEFAULT_GLOBAL_SETTINGS.theme).toBe('system');
  });
});
