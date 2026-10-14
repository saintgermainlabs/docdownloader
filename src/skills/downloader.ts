import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import {
  SkillDownloadOptions,
  SkillDownloadResult,
  SkillFileEntry,
  DownloadedSkillFile
} from './types';
import {
  parseGithubUrl,
  fetchRepoMetadata,
  fetchFileText,
  fetchGitTreeRecursive,
  fetchTreeContentsRecursive
} from '../github_docs/githubApi';
import { GithubFileEntry } from '../github_docs/types';
import { VisitedDatabase, computeHash } from '../storage/database';
import { resolveSkillsDir } from '../storage/paths';
import { logger, isDebugEnabled, setDebugMode, colors } from '../utils/logger';

/**
 * Extracts a skill title or name from file content (YAML frontmatter, Markdown header, or fallback).
 *
 * @param content - File content text.
 * @param fallbackName - Fallback name if no title found.
 * @returns Extracted title string.
 */
export function extractSkillTitle(content: string, fallbackName: string): string {
  // Check YAML frontmatter for title or name
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      const frontmatter = content.substring(3, endIdx);
      const titleMatch = frontmatter.match(/^title:\s*["']?([^"'\n\r]+)["']?/m);
      if (titleMatch && titleMatch[1]) {
        return titleMatch[1].trim();
      }
      const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\n\r]+)["']?/m);
      if (nameMatch && nameMatch[1]) {
        return nameMatch[1].trim();
      }
    }
  }

  // Check Markdown H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match && h1Match[1]) {
    return h1Match[1].trim();
  }

  return basename(fallbackName, '.md');
}

/**
 * Known directories inside repositories that commonly house agent skills.
 */
const KNOWN_SKILL_CONTAINERS = [
  'skills',
  '.agents/skills',
  'agent-skills',
  '.claude-plugin/skills',
  '.gemini/skills',
  'plugins/skills'
];

/**
 * Discovers and maps skill files inside a repository tree to their target relative paths in the skills directory.
 *
 * @param repoFiles - All file entries in the repository tree.
 * @param config - Options for filtering and mapping.
 * @returns Object containing unique skill names and mapped file entries.
 */
export function discoverSkillFiles(
  repoFiles: GithubFileEntry[],
  config: {
    tree?: string;
    skillName?: string;
    repoName: string;
  }
): { skills: string[]; files: SkillFileEntry[] } {
  const resultFiles: SkillFileEntry[] = [];
  const discoveredSkillsSet = new Set<string>();

  // Filter out non-file blobs or hidden git internals
  const validFiles = repoFiles.filter(
    (f) => f.type === 'file' && !f.path.startsWith('.git/') && !f.path.startsWith('.github/workflows/')
  );

  // Case 1: Specific tree path specified (e.g. `skills/defuddle` or `my-folder`)
  if (config.tree) {
    const cleanTree = config.tree.replace(/^\/+|\/+$/g, '');
    const treeFiles = validFiles.filter((f) => f.path === cleanTree || f.path.startsWith(`${cleanTree}/`));

    for (const f of treeFiles) {
      let targetRelativePath: string;
      let skillName = config.skillName || '';

      if (cleanTree.startsWith('skills/')) {
        // e.g. cleanTree = 'skills/defuddle'
        const sub = cleanTree.substring(7); // 'defuddle'
        skillName = skillName || sub.split('/')[0];
        targetRelativePath = f.path.substring(7); // 'defuddle/SKILL.md'
      } else if (cleanTree === 'skills') {
        const sub = f.path.substring(7);
        skillName = sub.split('/')[0];
        targetRelativePath = sub;
      } else {
        skillName = skillName || cleanTree.split('/').pop() || config.repoName;
        const subPath = f.path.substring(cleanTree.length).replace(/^\/+/, '');
        targetRelativePath = subPath ? `${skillName}/${subPath}` : `${skillName}/${f.name}`;
      }

      discoveredSkillsSet.add(skillName);
      resultFiles.push({
        repoPath: f.path,
        targetRelativePath,
        skillName,
        downloadUrl: f.downloadUrl,
        fileName: f.name
      });
    }

    return {
      skills: Array.from(discoveredSkillsSet),
      files: resultFiles
    };
  }

  // Case 2: Check for known skill container directories (e.g. `skills/`)
  for (const container of KNOWN_SKILL_CONTAINERS) {
    const prefix = `${container}/`;
    const containerFiles = validFiles.filter((f) => f.path.startsWith(prefix));

    if (containerFiles.length > 0) {
      for (const f of containerFiles) {
        const relUnderContainer = f.path.substring(prefix.length); // e.g. 'defuddle/SKILL.md' or 'defuddle/references/callout.md'
        const skillName = relUnderContainer.split('/')[0];

        if (config.skillName && skillName !== config.skillName) {
          continue;
        }

        discoveredSkillsSet.add(skillName);
        resultFiles.push({
          repoPath: f.path,
          targetRelativePath: relUnderContainer,
          skillName,
          downloadUrl: f.downloadUrl,
          fileName: f.name
        });
      }

      if (resultFiles.length > 0) {
        return {
          skills: Array.from(discoveredSkillsSet),
          files: resultFiles
        };
      }
    }
  }

  // Case 3: Root repository contains SKILL.md (single skill repo)
  const rootSkillFile = validFiles.find((f) => f.path.toLowerCase() === 'skill.md');
  if (rootSkillFile) {
    const skillName = config.skillName || config.repoName;
    discoveredSkillsSet.add(skillName);

    for (const f of validFiles) {
      resultFiles.push({
        repoPath: f.path,
        targetRelativePath: `${skillName}/${f.path}`,
        skillName,
        downloadUrl: f.downloadUrl,
        fileName: f.name
      });
    }

    return {
      skills: Array.from(discoveredSkillsSet),
      files: resultFiles
    };
  }

  // Case 4: Any subfolder in repo containing SKILL.md
  const skillConfigFiles = validFiles.filter((f) => basename(f.path).toLowerCase() === 'skill.md');
  if (skillConfigFiles.length > 0) {
    for (const skillConf of skillConfigFiles) {
      const skillDir = dirname(skillConf.path);
      const skillName = skillDir === '.' ? config.repoName : skillDir.split('/').pop() || config.repoName;

      if (config.skillName && skillName !== config.skillName) {
        continue;
      }

      discoveredSkillsSet.add(skillName);

      const skillFiles = validFiles.filter(
        (f) => f.path === skillConf.path || f.path.startsWith(`${skillDir}/`)
      );

      for (const f of skillFiles) {
        const subRel = skillDir === '.' ? f.path : f.path.substring(skillDir.length).replace(/^\/+/, '');
        resultFiles.push({
          repoPath: f.path,
          targetRelativePath: `${skillName}/${subRel}`,
          skillName,
          downloadUrl: f.downloadUrl,
          fileName: f.name
        });
      }
    }

    if (resultFiles.length > 0) {
      return {
        skills: Array.from(discoveredSkillsSet),
        files: resultFiles
      };
    }
  }

  // Fallback: If no SKILL.md found, map all markdown/code files into repo-named skill folder
  const fallbackSkillName = config.skillName || config.repoName;
  discoveredSkillsSet.add(fallbackSkillName);

  for (const f of validFiles) {
    resultFiles.push({
      repoPath: f.path,
      targetRelativePath: `${fallbackSkillName}/${f.path}`,
      skillName: fallbackSkillName,
      downloadUrl: f.downloadUrl,
      fileName: f.name
    });
  }

  return {
    skills: Array.from(discoveredSkillsSet),
    files: resultFiles
  };
}

/**
 * Downloads agent skills from a GitHub repository into the Obsidian second-brain vault skills folder.
 *
 * @remarks
 * Auto-detects `skills/` folders, single-skill repositories, and sub-trees, downloading all `SKILL.md`
 * definitions and supporting files directly into `<vault>/skills/<skill-name>/`, while recording metadata
 * in SQLite `./docs.db`.
 *
 * @param options - Configuration options for the skill downloader.
 * @returns Promise resolving to {@link SkillDownloadResult}.
 *
 * @example
 * ```typescript
 * import { downloadSkill } from 'ai-doc-downloader';
 *
 * const result = await downloadSkill({
 *   repoUrl: 'https://github.com/kepano/obsidian-skills'
 * });
 * console.log(`Installed ${result.discoveredSkills.length} skill(s) into ${result.targetDir}`);
 * ```
 */
export async function downloadSkill(options: SkillDownloadOptions): Promise<SkillDownloadResult> {
  const startTime = Date.now();

  if (options.debug !== undefined) {
    setDebugMode(options.debug);
  }

  const urlInfo = parseGithubUrl(options.repoUrl);
  const targetDir = resolveSkillsDir(options.outputDir);

  if (isDebugEnabled()) {
    logger.banner('ddocs skill: Agent Skill Downloader [DEBUG ACTIVE]');
    logger.debug('CONFIG', `Repository URL: ${options.repoUrl}`);
    logger.debug('CONFIG', `Owner: ${urlInfo.owner}, Repo: ${urlInfo.repo}`);
    logger.debug('CONFIG', `Target Skills Folder: ${targetDir}`);
    logger.debug('CONFIG', `Specific Tree: ${options.tree || urlInfo.treePath || '(auto-detect)'}`);
    logger.debug('CONFIG', `Skill Name Override: ${options.skillName || '(auto-detect)'}`);
    logger.debug('CONFIG', `Database Tracking: ${options.noDb ? 'DISABLED' : options.dbPath || './docs.db'}`);
  } else {
    console.log(`${colors.bold(colors.blue('=== Agent Skill Downloader ==='))}`);
    console.log(`${colors.bold('Repository:')}   https://github.com/${urlInfo.owner}/${urlInfo.repo}`);
    console.log(`${colors.bold('Destination:')}  ${targetDir}`);
  }

  // Ensure target skills directory exists
  mkdirSync(targetDir, { recursive: true });

  // Fetch repository metadata
  logger.step('GITHUB', `Fetching metadata for ${urlInfo.owner}/${urlInfo.repo}...`);
  const metadata = await fetchRepoMetadata(urlInfo.owner, urlInfo.repo);
  const branch = urlInfo.branch || metadata.defaultBranch || 'main';
  logger.debug('GITHUB', `Resolved default branch: "${branch}" (Description: "${metadata.description}")`);

  // Fetch repository tree (tries fast Git Trees API first, falls back to contents API)
  logger.step('GITHUB', `Retrieving repository tree for branch "${branch}"...`);
  let treeFiles = await fetchGitTreeRecursive(urlInfo.owner, urlInfo.repo, branch);

  if (!treeFiles || treeFiles.length === 0) {
    logger.debug('GITHUB', 'Git Trees API returned empty list, falling back to contents API...');
    const targetSubPath = options.tree || urlInfo.treePath || '';
    treeFiles = await fetchTreeContentsRecursive(urlInfo.owner, urlInfo.repo, branch, targetSubPath);
  }

  if (!treeFiles || treeFiles.length === 0) {
    throw new Error(
      `No files found in GitHub repository ${urlInfo.owner}/${urlInfo.repo} on branch "${branch}".`
    );
  }

  logger.debug('GITHUB', `Found ${treeFiles.length} total file(s) in repository tree`);

  // Discover and map skills
  const effectiveTree = options.tree || urlInfo.treePath;
  const { skills, files } = discoverSkillFiles(treeFiles, {
    tree: effectiveTree,
    skillName: options.skillName,
    repoName: urlInfo.repo
  });

  if (files.length === 0) {
    throw new Error(
      `No skill files or SKILL.md definitions found in ${options.repoUrl}${
        effectiveTree ? ` (under tree "${effectiveTree}")` : ''
      }.`
    );
  }

  console.log(
    `${colors.bold('Discovered Skills:')} ${skills.map((s) => colors.cyan(s)).join(', ')} (${files.length} file(s) total)`
  );

  // Initialize SQLite database tracking
  const dbPath = options.dbPath || './docs.db';
  let db: VisitedDatabase | null = null;
  const sourceSlug = options.slug || urlInfo.repo;
  const sourceName = options.name || `${urlInfo.repo} skills`;

  if (!options.noDb) {
    logger.step('DATABASE', `Recording source metadata in SQLite: ${dbPath}`);
    db = new VisitedDatabase(dbPath);
    db.recordSource({
      slug: sourceSlug,
      name: sourceName,
      startUrl: options.repoUrl,
      description: metadata.description || `Agent skills downloaded from ${options.repoUrl}`
    });
  }

  const downloadedFiles: DownloadedSkillFile[] = [];
  let totalDownloaded = 0;
  let totalSkipped = 0;

  logger.step('DOWNLOAD', `Downloading ${files.length} skill file(s)...`);

  for (const entry of files) {
    const destPath = join(targetDir, entry.targetRelativePath);
    const fileUrl = `https://github.com/${urlInfo.owner}/${urlInfo.repo}/blob/${branch}/${entry.repoPath}`;
    const relativeFilePath = relative(process.cwd(), destPath);

    try {
      logger.debug('FILE', `Fetching ${entry.repoPath} -> ${entry.targetRelativePath}`);
      const content = await fetchFileText(entry.downloadUrl);
      const hash = computeHash(content);
      const title = extractSkillTitle(content, entry.fileName);
      const sizeBytes = Buffer.byteLength(content, 'utf8');

      // Check if file already exists with same content (unless --force)
      if (!options.force && existsSync(destPath)) {
        if (db && db.hasVisited(fileUrl)) {
          const record = db.getRecord(fileUrl);
          if (record && record.contentHash === hash) {
            totalSkipped++;
            logger.debug('SKIP', `File already up to date: ${relativeFilePath}`);
            downloadedFiles.push({
              repoPath: entry.repoPath,
              localPath: destPath,
              relativeFilePath,
              url: fileUrl,
              title,
              contentHash: hash,
              sizeBytes
            });
            continue;
          }
        }
      }

      // Ensure directory exists and write file
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, content, 'utf-8');

      if (db) {
        db.recordVisited({
          url: fileUrl,
          sourceSlug,
          relativeFilePath,
          title,
          contentHash: hash
        });
      }

      totalDownloaded++;
      downloadedFiles.push({
        repoPath: entry.repoPath,
        localPath: destPath,
        relativeFilePath,
        url: fileUrl,
        title,
        contentHash: hash,
        sizeBytes
      });

      console.log(`  ${colors.green('✔')} Saved: ${colors.bold(entry.targetRelativePath)}`);
    } catch (err: any) {
      logger.error('DOWNLOAD', `Failed to download ${entry.repoPath}: ${err.message}`, err);
    }
  }

  if (db) {
    db.close();
  }

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  logger.step(
    'COMPLETE',
    `Successfully installed ${skills.length} skill(s) (${totalDownloaded} downloaded, ${totalSkipped} skipped) in ${elapsedSec}s`
  );

  return {
    repoUrl: options.repoUrl,
    sourceSlug,
    targetDir,
    discoveredSkills: skills,
    downloadedFiles,
    totalDownloaded,
    totalSkipped,
    elapsedMs
  };
}
