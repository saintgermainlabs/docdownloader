export type CrawlScope = 'subfolder' | 'website';

export function normalizeUrl(base: string, href: string): string | null {
  try {
    const url = new URL(href, base);
    
    // Remove the fragment
    url.hash = '';

    return url.href;
  } catch {
    return null;
  }
}

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

    // If pathname has a file extension (e.g. .html, .php, .md, .htm), extract parent directory
    if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
      return pathname.substring(0, pathname.lastIndexOf('/') + 1);
    }

    return pathname;
  } catch {
    return '/';
  }
}

export function isUrlInScope(targetUrl: string, startUrl: string, scope: CrawlScope = 'subfolder'): boolean {
  try {
    const target = new URL(targetUrl);
    const start = new URL(startUrl);

    // 1. Must be same origin
    if (target.origin !== start.origin) {
      return false;
    }

    if (scope === 'website') {
      return true;
    }

    // 2. Subfolder scope check
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