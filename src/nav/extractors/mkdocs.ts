import { parse } from 'yaml';
import { posix } from 'path';
import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { repoJoin } from '../repoConfigs';

function configOf(input: ExtractInput): string | undefined {
  if (input.configPath) return input.configPath;
  return [...(input.repoFiles?.keys() ?? [])].find((p) => /(^|\/)mkdocs\.ya?ml$/.test(p));
}

const DOC_EXT = /\.(md|mdx|markdown)$/i;

/** A nav target without a doc extension that names a folder: list that folder's docs. */
function folderEntry(label: string, target: string, docsRoot: string, files: Map<string, string>): NavNode | undefined {
  if (DOC_EXT.test(target) || /^https?:\/\//.test(target)) return undefined;
  const dir = repoJoin(docsRoot, target.replace(/\/+$/, ''));
  const docs = [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && DOC_EXT.test(p)).sort();
  if (!docs.length) return undefined;
  const index = docs.find((p) => /^(index|readme)\.(md|mdx|markdown)$/i.test(p.slice(dir.length + 1)));
  return {
    type: 'folder',
    name: label,
    ...(index ? { url: index } : {}),
    children: docs
      .filter((p) => p !== index)
      .map((p) => ({ type: 'link' as const, name: posix.basename(p).replace(DOC_EXT, ''), url: p })),
  };
}

function mapEntries(entries: unknown, docsRoot: string, files: Map<string, string> = new Map()): NavNode[] {
  if (!Array.isArray(entries)) return [];
  const out: NavNode[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push({ type: 'link', name: posix.basename(entry).replace(/\.mdx?$/, ''), url: resolve(entry, docsRoot) });
    } else if (entry && typeof entry === 'object') {
      for (const [label, value] of Object.entries(entry as Record<string, unknown>)) {
        if (typeof value === 'string') {
          out.push(folderEntry(label, value, docsRoot, files) ?? { type: 'link', name: label, url: resolve(value, docsRoot) });
        } else if (Array.isArray(value)) {
          out.push({ type: 'folder', name: label, children: mapEntries(value, docsRoot, files) });
        }
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
    return mapEntries(config.nav, docsRoot, input.repoFiles);
  },
};
