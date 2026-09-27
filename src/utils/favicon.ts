/**
 * favicon.ts
 * Where to load a site's icon from, best source first. Callers try each URL in
 * turn and move on when one fails to load (see components/SiteIcon.tsx).
 *
 * 1. The favicon the browser actually showed for the site's tab, recorded by the
 *    background worker while you browse (`siteIcons` in storage). This is always
 *    the right icon, including for sites that redirect to www. or a subdomain.
 * 2. Chrome's built-in `_favicon` cache, looked up with the site's real origin.
 *    (Not available in Firefox.)
 * 3. Google's favicon service, as a last resort.
 */

import { isExtensionUrl, type SiteIcon } from './storage';

/** Icon for the extension's own dashboard page. */
export const DASHBOARD_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

/** data: favicons larger than this aren't kept in storage (the origin lookup still works). */
export const MAX_DATA_ICON_LENGTH = 16_000;

export const isUsableIconUrl = (url: string | undefined): url is string =>
  Boolean(url) && (/^https?:\/\//.test(url!) || (url!.startsWith('data:image/') && url!.length <= MAX_DATA_ICON_LENGTH));

const chromeFaviconCache = (pageUrl: string): string | null => {
  try {
    // chrome.runtime.getURL exists in Firefox too, but _favicon is Chrome-only
    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL || !chrome.runtime.getURL('').startsWith('chrome-extension://')) {
      return null;
    }
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '64');
    return url.toString();
  } catch {
    return null;
  }
};

export const faviconCandidates = (domain: string, known?: SiteIcon): string[] => {
  if (!domain) return [];
  if (isExtensionUrl(domain)) return [DASHBOARD_ICON];
  const host = domain.replace(/^https?:\/\//, '');
  const sources: string[] = [];
  if (isUsableIconUrl(known?.icon)) sources.push(known!.icon!);
  const cached = chromeFaviconCache(known?.origin ?? `https://${host}`);
  if (cached) sources.push(cached);
  sources.push(`https://www.google.com/s2/favicons?domain=${host}&sz=64`);
  return [...new Set(sources)];
};
