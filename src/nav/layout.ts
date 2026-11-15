import { createHash } from 'crypto';
import { normalizeUrl } from '../crawler/urlUtils';
import { NavNode, PlannedTreeNode, LayoutPlan } from './types';

const NON_WORD = new RegExp('[^\\p{L}\\p{N}]+', 'gu');

/**
 * Turns a sidebar label into a filesystem-safe slug, keeping Unicode letters and digits.
 *
 * @example slugifyLabel('Prompt & Skill Management') // 'prompt-and-skill-management'
 */
export function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(NON_WORD, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalizes a URL into the key used by {@link LayoutPlan.paths}: absolute, no hash,
 * no trailing slash (except the root path).
 *
 * @returns The key, or `undefined` if the URL cannot be parsed.
 */
export function navUrlKey(url: string, baseUrl: string): string | undefined {
  const normalized = normalizeUrl(baseUrl, url);
  if (!normalized) return undefined;
  const parsed = new URL(normalized);
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  return parsed.href;
}

/**
 * Makes each separator own the items that follow it (up to the next separator),
 * recursively. Items before the first separator stay where they are.
 */
export function normalizeSeparators(nodes: NavNode[]): NavNode[] {
  const out: NavNode[] = [];
  let current: Extract<NavNode, { type: 'separator' }> | null = null;
  for (const node of nodes) {
    if (node.type === 'separator') {
      current = { type: 'separator', name: node.name, children: normalizeSeparators(node.children) };
      out.push(current);
      continue;
    }
    const normalized: NavNode =
      node.type === 'folder' ? { ...node, children: normalizeSeparators(node.children) } : node;
    if (current) current.children.push(normalized);
    else out.push(normalized);
  }
  return out;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function lastSegment(url: string | undefined, baseUrl: string): string {
  if (!url) return '';
  try {
    const segments = new URL(url, baseUrl).pathname.split('/').filter(Boolean);
    return slugifyLabel(decodeURIComponent(segments[segments.length - 1] || ''));
  } catch {
    return '';
  }
}

/**
 * Plans where each page of a sidebar tree is saved: numbered folders for separators and
 * folders, numbered `.md` files for links, `00-index.md` for a folder's own page.
 */
export function planLayout(
  nodes: NavNode[],
  opts: { baseUrl: string; inScope: (url: string) => boolean }
): LayoutPlan {
  const paths = new Map<string, string>();

  const resolve = (url: string | undefined) => {
    if (!url) return undefined;
    const key = navUrlKey(url, opts.baseUrl);
    if (!key) return undefined;
    return { key, inScope: opts.inScope(key) };
  };

  const place = (node: PlannedTreeNode, url: string | undefined, filePath: string) => {
    const resolved = resolve(url);
    if (!resolved) return;
    node.url = resolved.key;
    if (!resolved.inScope) {
      node.external = true;
      return;
    }
    const existing = paths.get(resolved.key);
    if (existing) {
      node.ref = existing;
    } else {
      paths.set(resolved.key, filePath);
      node.path = filePath;
    }
  };

  const walk = (list: NavNode[], dir: string): PlannedTreeNode[] => {
    const width = Math.max(2, String(list.length).length);
    const bases = list.map(
      (n) => slugifyLabel(n.name) || lastSegment(n.type === 'separator' ? undefined : n.url, opts.baseUrl) || 'item'
    );
    const counts = new Map<string, number>();
    bases.forEach((b) => counts.set(b, (counts.get(b) || 0) + 1));

    return list.map((n, i) => {
      const slug = (counts.get(bases[i])! > 1 ? `${bases[i]}-${shortHash(n.name)}` : bases[i]);
      const name = `${String(i + 1).padStart(width, '0')}-${slug}`;
      const planned: PlannedTreeNode = { type: n.type, name: n.name };
      if (n.type === 'link') {
        place(planned, n.url, `${dir}${name}.md`);
      } else {
        const subdir = `${dir}${name}`;
        if (n.type === 'folder' && n.url) {
          place(planned, n.url, `${subdir}/00-index.md`);
        } else {
          planned.path = subdir;
        }
        planned.children = walk(n.children, `${subdir}/`);
      }
      return planned;
    });
  };

  const tree = walk(normalizeSeparators(nodes), '');
  return { paths, tree };
}

/** Builds the `_tree.json` document for a layout plan. */
export function buildTreeJson(
  plan: LayoutPlan,
  meta: { source: string; framework: string }
): { source: string; framework: string; extractedAt: string; tree: PlannedTreeNode[] } {
  return {
    source: meta.source,
    framework: meta.framework,
    extractedAt: new Date().toISOString(),
    tree: plan.tree,
  };
}
