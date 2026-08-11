/**
 * Scope mode for crawling boundaries:
 * - `subfolder`: Only crawl pages within the initial URL's path subfolder.
 * - `website`: Crawl all pages under the same domain origin.
 */
export type CrawlScope = 'subfolder' | 'website';

/**
 * Normalizes a relative or absolute URL string against a base URL, stripping fragments (`#hash`).
 *
 * @param base - Base URL string to resolve relative links against.
 * @param href - Target link string (relative or absolute).
 * @returns The normalized URL string, or `null` if resolution fails.
 *
 * @example
 * ```typescript
 * normalizeUrl('https://example.com/docs/', '../about#section');
 * // Returns 'https://example.com/about'
 * ```
 */
export function normalizeUrl(base: string, href: string): string | null {
  try {
    const url = new URL(href, base);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Extracts the root subfolder directory path from a starting URL.
 *
 * @param startUrl - Initial URL to analyze.
 * @returns The subfolder pathname ending with a trailing slash (e.g. `/docs/v2/`).
 */
export function getSubfolderPath(startUrl: string): string {
  try {
    const url = new URL(startUrl);
    let pathname = url.pathname;

    if (!pathname) {
      return '/';
    }

    if (pathname.endsWith('/')) {
      return pathname;
    }

    if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
      return pathname.substring(0, pathname.lastIndexOf('/') + 1);
    }

    return pathname;
  } catch {
    return '/';
  }
}

/**
 * Determines whether a candidate URL falls within the allowed crawl scope.
 *
 * @param targetUrl - The target URL to test.
 * @param startUrl - The initial seed URL.
 * @param scope - The crawl scope constraint (`'subfolder'` or `'website'`).
 * @returns True if `targetUrl` is within scope and origin.
 */
export function isUrlInScope(targetUrl: string, startUrl: string, scope: CrawlScope = 'subfolder'): boolean {
  try {
    const target = new URL(targetUrl);
    const start = new URL(startUrl);

    if (target.origin !== start.origin) {
      return false;
    }

    if (scope === 'website') {
      return true;
    }

    const startSubfolder = getSubfolderPath(startUrl);
    const targetPath = target.pathname;

    if (startSubfolder.endsWith('/')) {
      return targetPath.startsWith(startSubfolder);
    } else {
      return targetPath === startSubfolder || targetPath.startsWith(startSubfolder + '/');
    }
  } catch {
    return false;
  }
}