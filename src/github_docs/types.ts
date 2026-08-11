/**
 * Parsed components of a GitHub repository or sub-tree URL.
 */
export interface GithubRepoUrlInfo {
  /** Repository owner username or organization */
  owner: string;
  /** Repository name */
  repo: string;
  /** Optional branch or git ref name */
  branch?: string;
  /** Optional sub-tree path inside the repository */
  treePath?: string;
  /** Canonical raw repository URL */
  rawRepoUrl: string;
}

/**
 * CLI options for configuring the automatic `github_docs` downloader module.
 */
export interface GithubDocsOptions {
  /** Target GitHub repository or tree URL */
  repoUrl: string;
  /** Whether to download root README.md (default: true) */
  readme?: boolean;
  /** Repository storage type (`'repo'` or `'list'`) */
  type?: 'repo' | 'list';
  /** Category directory under output root when type is `'list'` (default: `'awesome'`) */
  listType?: string;
  /** Specific sub-tree folder path to download recursively */
  tree?: string | false;
  /** Optional custom base output directory */
  outputBaseDir?: string;
  /** SQLite database path (default: `./docs.db`) */
  dbPath?: string;
}

/**
 * File entry metadata fetched from GitHub contents API.
 */
export interface GithubFileEntry {
  /** Base filename */
  name: string;
  /** Relative repository path */
  path: string;
  /** Direct raw download URL */
  downloadUrl: string;
  /** Entry type (`'file'` or `'dir'`) */
  type: 'file' | 'dir';
}
