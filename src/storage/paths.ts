import { join } from 'path';

/**
 * Checks if the current host environment is set to `'remote'`.
 *
 * @returns True if `process.env.HOST_ENV === 'remote'`.
 */
export function isRemoteEnv(): boolean {
  return process.env.HOST_ENV === 'remote';
}

/**
 * Resolves the knowledge-base root directory.
 *
 * Priority:
 * 1. `KNOWLEDGE_ROOT` env override
 * 2. `/srv/knowledge` when `HOST_ENV=remote`
 * 3. `/home/god/projects/knowledge` locally
 *
 * @returns Absolute knowledge root path.
 */
export function resolveKnowledgeRoot(): string {
  if (process.env.KNOWLEDGE_ROOT) {
    return process.env.KNOWLEDGE_ROOT;
  }
  if (isRemoteEnv()) {
    return '/srv/knowledge';
  }
  return '/home/god/projects/knowledge';
}

/**
 * Resolves the base root output directory based on storage type and host environment.
 *
 * @param type - Storage type (`'repo'` for docs, `'list'` for awesome lists, or `'clippings'` for single-page clips).
 * @param listType - Category directory under list root (default `'awesome'`).
 * @returns Base output directory path string.
 */
export function resolveBaseOutputDir(
  type: 'repo' | 'list' | 'clippings' = 'repo',
  listType: string = 'awesome'
): string {
  if (type === 'clippings') {
    return join(resolveKnowledgeRoot(), 'clippings');
  }

  if (isRemoteEnv()) {
    const remoteRoot = resolveKnowledgeRoot();
    if (type === 'list') {
      return join(remoteRoot, listType || 'awesome');
    }
    return join(remoteRoot, 'documents');
  }

  const localRoot = './output';
  if (type === 'list') {
    return join(localRoot, listType || 'awesome');
  }
  return localRoot;
}

/**
 * Resolves the destination directory for a single-page clipping.
 *
 * Defaults to `<knowledge-root>/clippings` (local knowledge checkout or `/srv/knowledge/clippings`).
 *
 * @param customDir - Optional custom output directory override.
 * @returns Absolute or relative clipping output directory.
 */
export function resolveClippingDir(customDir?: string): string {
  if (customDir && customDir !== './output' && customDir !== 'output') {
    return customDir;
  }
  return resolveBaseOutputDir('clippings');
}

/**
 * Resolves the final destination output directory for a source.
 *
 * @param nameOrSlug - The source name or slug subfolder.
 * @param type - Storage type (`'repo'` or `'list'`).
 * @param listType - Category directory for lists.
 * @param customDir - Optional custom output directory override.
 * @returns Final resolved destination output directory path.
 */
export function resolveOutputDir(
  nameOrSlug: string,
  type: 'repo' | 'list' = 'repo',
  listType: string = 'awesome',
  customDir?: string
): string {
  if (customDir && customDir !== './output' && customDir !== 'output') {
    return customDir;
  }
  const base = resolveBaseOutputDir(type, listType);
  return join(base, nameOrSlug);
}
