import { mkdirSync, writeFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { GithubDocsOptions } from './types';
import {
  parseGithubUrl,
  fetchRepoMetadata,
  fetchReadmeContent,
  fetchTreeContentsRecursive,
  fetchFileText
} from './githubApi';
import { VisitedDatabase, computeHash } from '../storage/database';

export function extractTitleFromContent(content: string, fallbackName: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return basename(fallbackName, '.md');
}

export async function downloadGithubDocs(options: GithubDocsOptions): Promise<number> {
  const urlInfo = parseGithubUrl(options.repoUrl);
  const metadata = await fetchRepoMetadata(urlInfo.owner, urlInfo.repo);
  const branch = urlInfo.branch || metadata.defaultBranch;

  const type = options.type || 'repo';
  const listType = options.listType || 'awesome';
  const outputBase = options.outputBaseDir || './output';

  const outputDir = type === 'list'
    ? join(outputBase, listType, urlInfo.repo)
    : join(outputBase, urlInfo.repo);

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

  // 1. Download README if readme !== false (default true)
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

  // 2. Resolve tree path
  let treePathToFetch: string | undefined;
  if (typeof options.tree === 'string' && options.tree.length > 0) {
    treePathToFetch = options.tree;
  } else if (urlInfo.treePath) {
    treePathToFetch = urlInfo.treePath;
  }

  if (treePathToFetch) {
    console.log(`Fetching GitHub tree path "${treePathToFetch}" for ${urlInfo.owner}/${urlInfo.repo}...`);
    const treeFiles = await fetchTreeContentsRecursive(urlInfo.owner, urlInfo.repo, branch, treePathToFetch);

    for (const entry of treeFiles) {
      try {
        const fileContent = await fetchFileText(entry.downloadUrl);
        
        // Save file maintain relative tree structure
        const fileRelSubPath = relative(treePathToFetch, entry.path);
        const savePath = join(outputDir, fileRelSubPath);
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
