import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { logger } from '../utils/logger';

/**
 * Result returned after saving a Markdown document to disk.
 */
export interface SavedFileResult {
  /** Relative file path where the file was saved */
  relativeFilePath: string;
}

/**
 * Handles saving Markdown files to disk maintaining URL pathname directory structures.
 */
export class FileStorage {
  /**
   * Constructs a FileStorage instance.
   *
   * @param baseDir - Root directory where Markdown files will be saved.
   */
  constructor(private baseDir: string) {}

  /**
   * Saves Markdown content to disk at a path derived from `url.pathname`.
   *
   * @param url - The URL object of the webpage.
   * @param content - Cleaned Markdown content string.
   * @returns A promise resolving to {@link SavedFileResult}.
   */
  async saveMarkdown(url: URL, content: string): Promise<SavedFileResult> {
    const fileName = this.urlToFilePath(url);
    const filePath = join(this.baseDir, fileName);
    
    logger.debug('STORAGE', `Writing Markdown file to ${filePath} (${content.length} chars)`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');

    return {
      relativeFilePath: filePath
    };
  }

  /**
   * Saves Markdown at an explicit relative path, prefixed with YAML frontmatter.
   *
   * @param relPath - Path relative to the base directory (e.g. `02-get-started/01-tracing.md`).
   * @param content - Markdown body.
   * @param frontmatter - `title` and `source_url` written as quoted YAML strings.
   */
  async saveMarkdownAt(
    relPath: string,
    content: string,
    frontmatter: { title: string; source_url: string }
  ): Promise<SavedFileResult> {
    const filePath = join(this.baseDir, relPath);
    const header = `---\ntitle: ${JSON.stringify(frontmatter.title)}\nsource_url: ${JSON.stringify(frontmatter.source_url)}\n---\n\n`;
    logger.debug('STORAGE', `Writing Markdown file to ${filePath} (${content.length} chars)`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, header + content, 'utf-8');
    return { relativeFilePath: filePath };
  }

  /**
   * Maps a URL pathname to a relative `.md` file path.
   *
   * @param url - Input URL object.
   * @returns Relative file path string ending with `.md`.
   */
  private urlToFilePath(url: URL): string {
    const path = url.pathname === '/' ? '/index' : url.pathname;
    return path.replace(/\/$/, '/index').replace(/\/$/, '') + '.md';
  }
}