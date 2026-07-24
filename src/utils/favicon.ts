/**
 * favicon.ts
 * Utility function to resolve favicon URLs using Chrome's native _favicon API
 * with fallback to Google's S2 Favicon service.
 */

export const getFaviconUrl = (domain: string): string => {
  if (!domain) return '';
  if (domain.startsWith('chrome-extension://')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;
  }
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      const url = new URL(chrome.runtime.getURL('/_favicon/'));
      url.searchParams.set('pageUrl', `https://${cleanDomain}`);
      url.searchParams.set('size', '64');
      return url.toString();
    }
  } catch (err) {
    console.warn('Failed to build chrome _favicon URL:', err);
  }
  return `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=64`;
};
