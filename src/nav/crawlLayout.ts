import { rename, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { LayoutPlan } from './types';
import { navUrlKey } from './layout';

/** Looks up the planned file path for a crawled URL (ignores hash and trailing slash). */
export function matchPlannedPath(plan: LayoutPlan, url: string): string | undefined {
  const key = navUrlKey(url, url);
  return key ? plan.paths.get(key) : undefined;
}

/** Path for a page that is not in the sidebar: `_unlisted/<url path>.md`. */
export function unlistedPath(url: URL): string {
  const path = url.pathname === '/' ? '/index' : url.pathname;
  return `_unlisted${path.replace(/\/$/, '/index')}.md`;
}

/**
 * Returns the final URL when navigation was redirected to a different page
 * (ignoring hash and trailing-slash differences), else undefined.
 */
export function redirectTarget(requested: string, final: string): string | undefined {
  const a = navUrlKey(requested, requested);
  const b = navUrlKey(final, final);
  return a && b && a !== b ? b : undefined;
}

/** False for HTTP error responses (4xx/5xx); true otherwise, including unknown status. */
export function shouldSavePage(status: number | undefined): boolean {
  return status === undefined || status < 400;
}

/**
 * Moves a previously saved file to its new planned path (when the sidebar changed).
 *
 * @returns True if a file was moved.
 */
export async function relocateIfMoved(baseDir: string, oldPath: string, newPath: string): Promise<boolean> {
  if (oldPath === newPath) return false;
  const from = join(baseDir, oldPath);
  try {
    await access(from);
  } catch {
    return false;
  }
  const to = join(baseDir, newPath);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  return true;
}
