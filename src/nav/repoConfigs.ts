import { posix } from 'path';

/** A sidebar config file found in a repository. */
export interface NavConfigRef {
  extractor: 'mkdocs' | 'summary-md' | 'docusaurus' | 'fumadocs-meta';
  configPath: string;
  /** Folder the config describes (its directory). */
  root: string;
}

const PATTERNS: Array<[NavConfigRef['extractor'], RegExp]> = [
  ['mkdocs', /(^|\/)mkdocs\.ya?ml$/],
  ['summary-md', /(^|\/)SUMMARY\.md$/],
  ['docusaurus', /(^|\/)sidebars\.(js|ts|json)$/],
  ['fumadocs-meta', /(^|\/)meta\.json$/],
];

/**
 * Finds sidebar config files among repository paths. For Fumadocs `meta.json`, only the
 * top-most file of each folder tree counts (nested ones belong to it).
 */
export function findNavConfigs(paths: string[]): NavConfigRef[] {
  const out: NavConfigRef[] = [];
  const metaDirs = new Set(
    paths.filter((p) => /(^|\/)meta\.json$/.test(p)).map((p) => posix.dirname(p))
  );
  for (const p of paths) {
    if (p.includes('node_modules/') || p.startsWith('.')) continue;
    for (const [extractor, re] of PATTERNS) {
      if (!re.test(p)) continue;
      const root = posix.dirname(p) === '.' ? '' : posix.dirname(p);
      if (extractor === 'fumadocs-meta') {
        let parent = posix.dirname(root || '.');
        let nested = false;
        while (root && parent !== '.' && parent !== '') {
          if (metaDirs.has(parent)) nested = true;
          parent = posix.dirname(parent);
        }
        if (nested || (root && metaDirs.has('.'))) continue;
      }
      out.push({ extractor, configPath: p, root });
    }
  }
  return out;
}

/** Joins repo path segments, dropping empty ones. */
export function repoJoin(...parts: string[]): string {
  return posix.normalize(parts.filter(Boolean).join('/')).replace(/^\.\//, '');
}
