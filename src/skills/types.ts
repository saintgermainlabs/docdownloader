/**
 * Type definitions and interfaces for the Agent Skill Downloader module.
 */

/**
  * Options for configuring the Agent Skill Downloader.
  */
export interface SkillDownloadOptions {
  /** Target GitHub repository URL, sub-tree URL, or owner/repo string (e.g. `https://github.com/kepano/obsidian-skills`) */
  repoUrl: string;
  /** Specific skill name or target folder name override */
  skillName?: string;
  /** Specific subfolder tree inside repository (e.g. `skills` or `skills/defuddle`) */
  tree?: string;
  /** Custom destination directory (defaults to `<second-brain-vault>/skills`) */
  outputDir?: string;
  /** Custom source slug key for SQLite tracking (default: derived from repo or skill name) */
  slug?: string;
  /** Custom display name for SQLite tracking */
  name?: string;
  /** SQLite database path (default: `./docs.db`) */
  dbPath?: string;
  /** Skip recording downloaded files in SQLite docs.db */
  noDb?: boolean;
  /** Overwrite and re-download existing files without skipping */
  force?: boolean;
  /** Enable verbose step-by-step debug logging */
  debug?: boolean;
}

/**
  * Internal metadata representation of a discovered skill file to download.
  */
export interface SkillFileEntry {
  /** Relative path in the git repository (e.g. `skills/defuddle/SKILL.md`) */
  repoPath: string;
  /** Target relative path within the destination skills directory (e.g. `defuddle/SKILL.md`) */
  targetRelativePath: string;
  /** Parent skill directory name (e.g. `defuddle`) */
  skillName: string;
  /** Direct raw download URL */
  downloadUrl: string;
  /** Base filename */
  fileName: string;
}

/**
  * Record of a downloaded skill file.
  */
export interface DownloadedSkillFile {
  /** Original path in repository */
  repoPath: string;
  /** Absolute local file path on disk */
  localPath: string;
  /** Relative file path from current working directory */
  relativeFilePath: string;
  /** Web or raw GitHub URL of the file */
  url: string;
  /** Extracted title or skill name */
  title: string;
  /** SHA-256 hash of the downloaded content */
  contentHash: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
  * Final result summary of a skill download operation.
  */
export interface SkillDownloadResult {
  /** Repository URL or identifier */
  repoUrl: string;
  /** Source slug identifier used in SQLite docs.db */
  sourceSlug: string;
  /** Absolute target skills destination directory */
  targetDir: string;
  /** List of discovered unique skill names installed */
  discoveredSkills: string[];
  /** Array of downloaded file records */
  downloadedFiles: DownloadedSkillFile[];
  /** Total number of files downloaded or written */
  totalDownloaded: number;
  /** Total number of files skipped (if not forced) */
  totalSkipped: number;
  /** Total elapsed execution duration in milliseconds */
  elapsedMs: number;
}
