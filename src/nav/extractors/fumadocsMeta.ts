import { posix } from 'path';
import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { normalizeSeparators } from '../layout';
import { repoJoin } from '../repoConfigs';

function configOf(input: ExtractInput): string | undefined {
  return input.configPath ?? [...(input.repoFiles?.keys() ?? [])].find((p) => /(^|\/)meta\.json$/.test(p));
}

function readMeta(files: Map<string, string>, path: string): { title?: string; pages?: unknown[] } | undefined {
  const text = files.get(path);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function walk(files: Map<string, string>, dir: string, depth: number): NavNode[] {
  const meta = readMeta(files, repoJoin(dir, 'meta.json'));
  if (!meta || !Array.isArray(meta.pages) || depth > 20) return [];
  const out: NavNode[] = [];
  for (const entry of meta.pages) {
    if (typeof entry !== 'string' || entry.startsWith('...')) continue;
    const sep = entry.match(/^---(.+)---$/);
    if (sep) {
      out.push({ type: 'separator', name: sep[1].trim(), children: [] });
      continue;
    }
    const link = entry.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      out.push({ type: 'link', name: link[1], url: link[2] });
      continue;
    }
    const sub = repoJoin(dir, entry);
    const subMeta = readMeta(files, repoJoin(sub, 'meta.json'));
    if (subMeta) {
      out.push({ type: 'folder', name: subMeta.title ?? entry, children: walk(files, sub, depth + 1) });
      continue;
    }
    const file = ['.mdx', '.md'].map((ext) => sub + ext).find((p) => files.has(p));
    if (file) out.push({ type: 'link', name: entry, url: file });
  }
  return out;
}

/** Reads Fumadocs `meta.json` page orders from a repository (separators as `---Label---`). */
export const fumadocsMetaExtractor: NavExtractor = {
  id: 'fumadocs-meta',
  matches: (input) => !!configOf(input) && !!input.repoFiles?.get(configOf(input)!),
  async extract(input) {
    const path = configOf(input);
    if (!path || !input.repoFiles) return [];
    const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
    return normalizeSeparators(walk(input.repoFiles, dir, 0));
  },
};
