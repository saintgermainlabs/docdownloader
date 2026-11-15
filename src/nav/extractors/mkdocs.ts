import { parse } from 'yaml';
import { posix } from 'path';
import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { repoJoin } from '../repoConfigs';

function configOf(input: ExtractInput): string | undefined {
  if (input.configPath) return input.configPath;
  return [...(input.repoFiles?.keys() ?? [])].find((p) => /(^|\/)mkdocs\.ya?ml$/.test(p));
}

function mapEntries(entries: unknown, docsRoot: string): NavNode[] {
  if (!Array.isArray(entries)) return [];
  const out: NavNode[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push({ type: 'link', name: posix.basename(entry).replace(/\.mdx?$/, ''), url: resolve(entry, docsRoot) });
    } else if (entry && typeof entry === 'object') {
      for (const [label, value] of Object.entries(entry as Record<string, unknown>)) {
        if (typeof value === 'string') out.push({ type: 'link', name: label, url: resolve(value, docsRoot) });
        else if (Array.isArray(value)) out.push({ type: 'folder', name: label, children: mapEntries(value, docsRoot) });
      }
    }
  }
  return out;
}

function resolve(target: string, docsRoot: string): string {
  return /^https?:\/\//.test(target) ? target : repoJoin(docsRoot, target);
}

/** Reads the `nav:` tree from an MkDocs config (`mkdocs.yml`). */
export const mkdocsExtractor: NavExtractor = {
  id: 'mkdocs',
  matches: (input) => !!configOf(input) && !!input.repoFiles?.get(configOf(input)!),
  async extract(input) {
    const path = configOf(input);
    const text = path ? input.repoFiles?.get(path) : undefined;
    if (!path || !text) return [];
    // MkDocs configs may contain custom tags (!!python/name:...); ignore them.
    const config = parse(text, { customTags: [], logLevel: 'silent' } as any) ?? {};
    const docsRoot = repoJoin(posix.dirname(path) === '.' ? '' : posix.dirname(path), config.docs_dir ?? 'docs');
    return mapEntries(config.nav, docsRoot);
  },
};
