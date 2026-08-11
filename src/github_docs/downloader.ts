import { mkdirSync, writeFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { GithubDocsOptions } from './types';
import {
  parseGithubUrl,
  fetchRepoMetadata,
  fetchReadmeContent,
  fetchTreeContentsRecursive,
  fetchRepoRootDirectories,
  fetchFileText
} from './githubApi';
import { VisitedDatabase, computeHash } from '../storage/database';
import { resolveOutputDir } from '../storage/paths';

/**
 * Extracts H1 heading title from Markdown content or falls back to filename.
 *
 * @param content - Markdown file content string.
 * @param fallbackName - Default filename string if no H1 heading exists.
 * @returns Extracted title string.
 */
export function extractTitleFromContent(content: string, fallbackName: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return basename(fallbackName, '.md');
}

/**
 * Main automatic entrypoint for downloading GitHub documentation repositories and tree paths.
 *
 * @remarks
 * Auto-detects list vs repo types, fetches README files, auto-discovers `docs`, `usecases`,
 * and `categories` subtrees, saves files to disk, and records metadata in `./docs.db`.
 *
 * @param options - GitHub docs download options.
 * @returns Promise resolving to the number of downloaded files.
 *
 * @example
 * ```typescript
 * await downloadGithubDocs({
 *   repoUrl: 'https://github.com/aliaihub/awesome-hermes-usecases'
 * });
 * ```
 */
export async function downloadGithubDocs(options: GithubDocsOptions): Promise<number> {
  const urlInfo = parseGithubUrl(options.repoUrl);
  const metadata = await fetchRepoMetadata(urlInfo.owner, urlInfo.repo);
  const branch = urlInfo.branch || metadata.defaultBranch;

  const isAwesome = /awesome/i.test(options.repoUrl);
  const type = options.type || (isAwesome ? 'list' : 'repo');
  const listType = options.listType || 'awesome';

  const outputDir = resolveOutputDir(urlInfo.repo, type, listType, options.outputBaseDir);

  mkdirSync(outputDir, { recursive: true });

  const dbPath = options.dbPath || './docs.db';
  const db = new VisitedDatabase(dbPath);
  const sourceSlug = urlInfo.repo;

  db.recordSource({
    slug: sourceSlug,
    name: urlInfo.repo,
    startUrl: options.repoUrl,
    description: metadata.description
  });

  let downloadedCount = 0;

  const shouldDownloadReadme = options.readme !== false;
  if (shouldDownloadReadme) {
    const readmeRes = await fetchReadmeContent(urlInfo.owner, urlInfo.repo, branch);
    if (readmeRes) {
      const savePath = join(outputDir, readmeRes.fileName);
      writeFileSync(savePath, readmeRes.content, 'utf-8');
      
      const relativePath = relative(process.cwd(), savePath);
      const title = extractTitleFromContent(readmeRes.content, readmeRes.fileName);
      const hash = computeHash(readmeRes.content);
      const fileUrl = `https://github.com/${urlInfo.owner}/${urlInfo.repo}/blob/${branch}/${readmeRes.fileName}`;

      db.recordVisited({
        url: fileUrl,
        sourceSlug,
        relativeFilePath: relativePath,
        title,
        contentHash: hash
      });
      downloadedCount++;
      console.log(`Saved README: ${relativePath}`);
    }
  }

  const targetSubpaths: string[] = [];
  if (typeof options.tree === 'string' && options.tree.length > 0) {
    targetSubpaths.push(options.tree);
  } else if (urlInfo.treePath) {
    targetSubpaths.push(urlInfo.treePath);
  } else {
    const rootDirs = await fetchRepoRootDirectories(urlInfo.owner, urlInfo.repo, branch);
    const matchedDirs = rootDirs.filter((dirName) =>
      /^(docs|usecases|categories)$/i.test(dirName)
    );
    targetSubpaths.push(...matchedDirs);
  }

  for (const treePath of targetSubpaths) {
    console.log(`Fetching GitHub tree path "${treePath}" for ${urlInfo.owner}/${urlInfo.repo}...`);
    const treeFiles = await fetchTreeContentsRecursive(urlInfo.owner, urlInfo.repo, branch, treePath);

    for (const entry of treeFiles) {
      try {
        const fileContent = await fetchFileText(entry.downloadUrl);
        
        const savePath = join(outputDir, entry.path);
        mkdirSync(join(savePath, '..'), { recursive: true });

        writeFileSync(savePath, fileContent, 'utf-8');

        const relativePath = relative(process.cwd(), savePath);
        const title = extractTitleFromContent(fileContent, entry.name);
        const hash = computeHash(fileContent);
        const fileUrl = `https://github.com/${urlInfo.owner}/${urlInfo.repo}/blob/${branch}/${entry.path}`;

        db.recordVisited({
          url: fileUrl,
          sourceSlug,
          relativeFilePath: relativePath,
          title,
          contentHash: hash
        });

        downloadedCount++;
        console.log(`Saved tree file: ${relativePath}`);
      } catch (err: any) {
        console.error(`Failed to download tree file ${entry.path}:`, err.message);
      }
    }
  }

  db.close();
  console.log(`Finished github_docs processing for ${urlInfo.repo} (${downloadedCount} file(s) saved to ${outputDir})`);
  return downloadedCount;
}
