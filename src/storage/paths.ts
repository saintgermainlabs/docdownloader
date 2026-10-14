import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Checks if the current host environment is set to `'remote'`.
 *
 * @returns True if `process.env.HOST_ENV === 'remote'`.
 */
export function isRemoteEnv(): boolean {
  return process.env.HOST_ENV === 'remote';
}

/**
 * Resolves the knowledge-base root directory (Obsidian vault).
 *
 * Priority:
 * 1. `KNOWLEDGE_ROOT` env override
 * 2. `OBSIDIAN_VAULT_PATH` env override
 * 3. `/srv/knowledge` when `HOST_ENV=remote`
 * 4. `/home/god/obsidian-vaults/agent/second-brain` (default Obsidian agent vault)
 * 5. `/home/god/projects/knowledge` fallback
 *
 * @returns Absolute knowledge root path.
 */
export function resolveKnowledgeRoot(): string {
  if (process.env.KNOWLEDGE_ROOT) {
    return process.env.KNOWLEDGE_ROOT;
  }
  if (process.env.OBSIDIAN_VAULT_PATH) {
    return process.env.OBSIDIAN_VAULT_PATH;
  }
  if (isRemoteEnv()) {
    return '/srv/knowledge';
  }

  const defaultVaultCandidate = '/home/god/obsidian-vaults/agent/second-brain';
  if (existsSync(defaultVaultCandidate)) {
    return defaultVaultCandidate;
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
  type: 'repo' | 'list' | 'clippings' | 'skills' = 'repo',
  listType: string = 'awesome'
): string {
  const root = resolveKnowledgeRoot();

  if (type === 'clippings') {
    return join(root, 'clippings');
  }

  if (type === 'skills') {
    return join(root, 'skills');
  }

  if (isRemoteEnv()) {
    const remoteRoot = '/srv/knowledge';
    if (type === 'list') {
      return join(remoteRoot, listType || 'awesome');
    }
    return join(remoteRoot, 'documentation');
  }

  // When targeting an Obsidian vault or custom knowledge root
  if (
    process.env.KNOWLEDGE_ROOT ||
    process.env.OBSIDIAN_VAULT_PATH ||
    existsSync('/home/god/obsidian-vaults/agent/second-brain')
  ) {
    if (type === 'list') {
      return join(root, listType || 'awesome');
    }
    if (existsSync(join(root, 'Documentation'))) {
      return join(root, 'Documentation');
    }
    return join(root, 'Documents');
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
 * Resolves the destination directory for agent skills in the Obsidian second-brain vault or remote knowledge tree.
 *
 * Defaults to `<knowledge-root>/skills` (e.g. `/home/god/obsidian-vaults/agent/second-brain/skills` or `/srv/knowledge/skills`).
 *
 * @param customDir - Optional custom output directory override.
 * @returns Absolute or relative skills output directory.
 */
export function resolveSkillsDir(customDir?: string): string {
  if (customDir && customDir !== './output' && customDir !== 'output') {
    return customDir;
  }
  return resolveBaseOutputDir('skills');
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
