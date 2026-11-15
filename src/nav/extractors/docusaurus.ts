import { posix } from 'path';
import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { repoJoin } from '../repoConfigs';
import { sliceBalanced } from './fumadocs';

function configOf(input: ExtractInput): string | undefined {
  return input.configPath ?? [...(input.repoFiles?.keys() ?? [])].find((p) => /(^|\/)sidebars\.(js|ts|json)$/.test(p));
}

/**
 * Converts a plain JS object literal to JSON text. Returns undefined when the literal
 * contains anything beyond plain data (calls, identifiers, spreads). Never evaluates code.
 */
export function jsLiteralToJson(source: string): unknown {
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_, s: string) => JSON.stringify(s.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

function mapItems(items: unknown, docsRoot: string, files: Map<string, string>): NavNode[] {
  if (!Array.isArray(items)) return [];
  const docPath = (id: string) => {
    for (const ext of ['.md', '.mdx']) {
      const p = repoJoin(docsRoot, id + ext);
      if (files.has(p)) return p;
    }
    return repoJoin(docsRoot, `${id}.md`);
  };
  const out: NavNode[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      out.push({ type: 'link', name: posix.basename(item), url: docPath(item) });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, any>;
    if (it.type === 'category') {
      out.push({ type: 'folder', name: String(it.label ?? ''), children: mapItems(it.items, docsRoot, files) });
    } else if (it.type === 'doc' && typeof it.id === 'string') {
      out.push({ type: 'link', name: String(it.label ?? posix.basename(it.id)), url: docPath(it.id) });
    } else if (it.type === 'link' && typeof it.href === 'string') {
      out.push({ type: 'link', name: String(it.label ?? it.href), url: it.href });
    }
  }
  return out;
}

/** Reads Docusaurus `sidebars.js|ts|json` when it is a plain object literal (no code execution). */
export const docusaurusExtractor: NavExtractor = {
  id: 'docusaurus',
  matches: (input) => !!configOf(input) && !!input.repoFiles?.get(configOf(input)!),
  async extract(input) {
    const path = configOf(input);
    const files = input.repoFiles ?? new Map<string, string>();
    const text = path ? files.get(path) : undefined;
    if (!path || !text) return [];

    let data: unknown;
    if (path.endsWith('.json')) {
      try { data = JSON.parse(text); } catch { return []; }
    } else {
      const anchor = text.search(/(module\.exports\s*=|export\s+default|const\s+\w+\s*(:\s*[\w.]+)?\s*=)/);
      const start = anchor === -1 ? -1 : text.indexOf('{', anchor);
      const literal = start === -1 ? undefined : sliceBalanced(text, start);
      data = literal ? jsLiteralToJson(literal) : undefined;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];

    const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
    const docsRoot = repoJoin(dir, 'docs');
    const sidebars = Object.entries(data as Record<string, unknown>);
    if (sidebars.length === 1) return mapItems(sidebars[0][1], docsRoot, files);
    return sidebars.map(([name, items]) => ({ type: 'separator', name, children: mapItems(items, docsRoot, files) }));
  },
};
