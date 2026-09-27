import { describe, it, expect } from 'vitest';
import { faviconCandidates, isUsableIconUrl, DASHBOARD_ICON, MAX_DATA_ICON_LENGTH } from './favicon';

// Tests run in Node, where `chrome` is undefined, so the Chrome-only _favicon
// source is absent and the list is: recorded icon, then Google's service.
const GOOGLE = (host: string) => `https://www.google.com/s2/favicons?domain=${host}&sz=64`;

describe('faviconCandidates', () => {
  it('tries the recorded tab favicon first, Google last', () => {
    const icon = 'https://www.youtube.com/s/desktop/abc/img/favicon_32x32.png';
    expect(faviconCandidates('youtube.com', { icon, origin: 'https://www.youtube.com' })).toEqual([
      icon,
      GOOGLE('youtube.com'),
    ]);
  });

  it('falls back to Google when nothing was recorded', () => {
    expect(faviconCandidates('reddit.com')).toEqual([GOOGLE('reddit.com')]);
  });

  it('uses the dashboard icon for the extension page', () => {
    expect(faviconCandidates('chrome-extension://abc/index.html')).toEqual([DASHBOARD_ICON]);
    expect(faviconCandidates('moz-extension://abc/index.html')).toEqual([DASHBOARD_ICON]);
  });

  it('skips oversized data: icons', () => {
    const big = `data:image/png;base64,${'A'.repeat(MAX_DATA_ICON_LENGTH)}`;
    expect(faviconCandidates('x.com', { icon: big })).toEqual([GOOGLE('x.com')]);
  });

  it('returns nothing for an empty domain', () => {
    expect(faviconCandidates('')).toEqual([]);
  });
});

describe('isUsableIconUrl', () => {
  it('accepts http(s) and small data:image URLs only', () => {
    expect(isUsableIconUrl('https://github.com/favicon.ico')).toBe(true);
    expect(isUsableIconUrl('data:image/svg+xml,<svg/>')).toBe(true);
    expect(isUsableIconUrl('chrome://favicon/https://x.com')).toBe(false);
    expect(isUsableIconUrl('javascript:alert(1)')).toBe(false);
    expect(isUsableIconUrl(undefined)).toBe(false);
  });
});
