import { rename, mkdir, readFile } from 'fs/promises';
import { computeHash } from '../storage/database';
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

/** Strips a leading YAML frontmatter block written by `saveMarkdownAt`. */
function bodyOf(text: string): string {
  const m = text.match(/^---\n[\s\S]*?\n---\n\n?/);
  return m ? text.slice(m[0].length) : text;
}

/**
 * Moves a previously saved file to its new planned path (when the sidebar changed).
 *
 * @param expectedHash - SHA-256 of the page body recorded in the index; when given, the move is
 *   refused if the file no longer holds that page (e.g. another page was saved over it).
 * @returns `moved`, `unchanged` (same path), or `stale` (file missing or not this page's
 *   content; the caller should download the page again).
 */
export async function relocateIfMoved(
  baseDir: string,
  oldPath: string,
  newPath: string,
  expectedHash?: string
): Promise<'moved' | 'unchanged' | 'stale'> {
  if (oldPath === newPath) return 'unchanged';
  if (oldPath.startsWith('..')) return 'stale';
  const from = join(baseDir, oldPath);
  let text: string;
  try {
    text = await readFile(from, 'utf-8');
  } catch {
    return 'stale';
  }
  if (expectedHash && computeHash(bodyOf(text)) !== expectedHash) return 'stale';
  const to = join(baseDir, newPath);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  return 'moved';
}

/**
 * When a sidebar URL redirects, gives its planned slot to the redirect target
 * (if the target has no slot of its own).
 *
 * @returns True if the slot was carried over.
 */
export function carryPlannedPath(plan: LayoutPlan, from: string, to: string): boolean {
  const fromKey = navUrlKey(from, from);
  const toKey = navUrlKey(to, to);
  if (!fromKey || !toKey) return false;
  const path = plan.paths.get(fromKey);
  if (!path || plan.paths.has(toKey)) return false;
  plan.paths.set(toKey, path);
  return true;
}

/** Queue key for a discovered link: with a sidebar plan, slash/hash variants collapse to one key. */
export function queueKey(url: string, hasPlan: boolean): string {
  return hasPlan ? navUrlKey(url, url) ?? url : url;
}

/**
 * The URL crawl scope is measured against: the start URL, moved to the final URL's origin when
 * the seed redirected to another origin (http -> https, www). The start path is kept, so a seed
 * that redirects deeper (`/docs/x` -> `/docs/x/overview`) does not narrow the scope.
 */
export function scopeBaseAfterRedirect(startUrl: string, finalUrl: string): string {
  try {
    const start = new URL(startUrl);
    const final = new URL(finalUrl);
    if (start.origin === final.origin) return startUrl;
    return final.origin + start.pathname + start.search;
  } catch {
    return startUrl;
  }
}
