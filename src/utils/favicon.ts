/**
 * favicon.ts
 * Utility function to resolve favicon URLs using Chrome's native _favicon API
 * with fallback to Google's S2 Favicon service.
 */

export const getFaviconUrl = (domain: string): string => {
  if (!domain) return '';
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
