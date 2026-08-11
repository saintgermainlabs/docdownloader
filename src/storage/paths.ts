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
 * Resolves the base root output directory based on storage type and host environment.
 *
 * @param type - Storage type (`'repo'` for docs or `'list'` for awesome lists).
 * @param listType - Category directory under list root (default `'awesome'`).
 * @returns Base output directory path string.
 */
export function resolveBaseOutputDir(type: 'repo' | 'list' = 'repo', listType: string = 'awesome'): string {
  if (isRemoteEnv()) {
    const remoteRoot = '/srv/knowledge';
    if (type === 'list') {
      return join(remoteRoot, listType || 'awesome');
    }
    return join(remoteRoot, 'documentation');
  }

  const localRoot = './output';
  if (type === 'list') {
    return join(localRoot, listType || 'awesome');
  }
  return localRoot;
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
