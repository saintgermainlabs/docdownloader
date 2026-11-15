import { join } from 'path';
import { existsSync } from 'fs';

/** Default local output root used when no knowledge root is configured. */
export const DEFAULT_OUTPUT_ROOT = './output';

/** Default knowledge root used when `HOST_ENV=remote` and no override is set. */
export const DEFAULT_REMOTE_ROOT = '/srv/knowledge';

/**
 * Checks if the current host environment is set to `'remote'`.
 *
 * @returns True if `process.env.HOST_ENV === 'remote'`.
 */
export function isRemoteEnv(): boolean {
  return process.env.HOST_ENV === 'remote';
}

/**
 * Returns the user-configured knowledge root, if any (`KNOWLEDGE_ROOT` or `OBSIDIAN_VAULT_PATH`).
 */
function configuredRoot(): string | undefined {
  return process.env.KNOWLEDGE_ROOT || process.env.OBSIDIAN_VAULT_PATH || undefined;
}

/**
 * Resolves the knowledge-base root directory.
 *
 * Priority:
 * 1. `KNOWLEDGE_ROOT` env override
 * 2. `OBSIDIAN_VAULT_PATH` env override (e.g. an Obsidian vault)
 * 3. `/srv/knowledge` when `HOST_ENV=remote`
 * 4. `./output` (relative to the current working directory)
 *
 * @returns Knowledge root path.
 */
export function resolveKnowledgeRoot(): string {
  const configured = configuredRoot();
  if (configured) {
    return configured;
  }
  if (isRemoteEnv()) {
    return DEFAULT_REMOTE_ROOT;
  }
  return DEFAULT_OUTPUT_ROOT;
}

/**
 * Resolves the base root output directory based on storage type and host environment.
 *
 * | type      | HOST_ENV=remote        | KNOWLEDGE_ROOT / OBSIDIAN_VAULT_PATH set     | default                  |
 * |-----------|------------------------|----------------------------------------------|--------------------------|
 * | repo      | `<root>/documentation` | `<root>/Documentation` if present, else `<root>/Documents` | `./output`  |
 * | list      | `<root>/<listType>`    | `<root>/<listType>`                          | `./output/<listType>`    |
 * | clippings | `<root>/clippings`     | `<root>/clippings`                           | `./output/clippings`     |
 * | skills    | `<root>/skills`        | `<root>/skills`                              | `./output/skills`        |
 *
 * @param type - Storage type (`'repo'` for docs, `'list'` for awesome lists, `'clippings'` or `'skills'`).
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
  if (type === 'list') {
    return join(root, listType || 'awesome');
  }

  // type === 'repo'
  if (configuredRoot()) {
    if (existsSync(join(root, 'Documentation'))) {
      return join(root, 'Documentation');
    }
    return join(root, 'Documents');
  }
  if (isRemoteEnv()) {
    return join(root, 'documentation');
  }
  return DEFAULT_OUTPUT_ROOT;
}

/** True when a custom directory was explicitly provided (the default `./output` does not count). */
function isCustomDir(customDir?: string): customDir is string {
  return !!customDir && customDir !== DEFAULT_OUTPUT_ROOT && customDir !== 'output';
}

/**
 * Resolves the destination directory for a single-page clipping (`<knowledge-root>/clippings`).
 *
 * @param customDir - Optional custom output directory override.
 * @returns Clipping output directory.
 */
export function resolveClippingDir(customDir?: string): string {
  return isCustomDir(customDir) ? customDir : resolveBaseOutputDir('clippings');
}

/**
 * Resolves the destination directory for agent skills (`<knowledge-root>/skills`).
 *
 * @param customDir - Optional custom output directory override.
 * @returns Skills output directory.
 */
export function resolveSkillsDir(customDir?: string): string {
  return isCustomDir(customDir) ? customDir : resolveBaseOutputDir('skills');
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
  if (isCustomDir(customDir)) {
    return customDir;
  }
  return join(resolveBaseOutputDir(type, listType), nameOrSlug);
}
