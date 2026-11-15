import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, posix } from 'path';
import { SourceHandler, Finding, Probe, RunOptions, RunResult } from '../types';
import {
  parseGithubUrl,
  fetchRepoMetadata,
  fetchGitTreeWithMeta,
  fetchFileText,
} from '../../github_docs/githubApi';
import { GithubFileEntry, GithubRepoUrlInfo } from '../../github_docs/types';
import { extractTitleFromContent } from '../../github_docs/downloader';
import { findNavConfigs, NavConfigRef, repoJoin } from '../../nav/repoConfigs';
import { getExtractor } from '../../nav/registry';
import { planLayout, buildTreeJson } from '../../nav/layout';
import { NavNode } from '../../nav/types';
import { resolveOutputDir } from '../../storage/paths';
import { VisitedDatabase, computeHash } from '../../storage/database';

/** Injectable network dependencies (tests pass fakes). */
export interface GithubDeps {
  meta: () => Promise<{ defaultBranch: string; description: string; homepage?: string }>;
  tree: (ref: string) => Promise<{ files: GithubFileEntry[]; truncated: boolean }>;
  fetchText: (rawUrl: string) => Promise<string>;
}

const DOC_EXT = /\.(md|mdx|rst|txt|adoc)$/i;
const DOCUMENT_EXT = /\.(pdf|docx?|pptx|xlsx)$/i;
const DOC_DIRS = new Set(['docs', 'documentation', 'doc', 'website/docs']);
const CONFIDENCE = 0.95;

function defaultDeps(info: GithubRepoUrlInfo): GithubDeps {
  return {
    meta: () => fetchRepoMetadata(info.owner, info.repo),
    tree: (ref) => fetchGitTreeWithMeta(info.owner, info.repo, ref),
    fetchText: (url) => fetchFileText(url),
  };
}

/** Folder a nav config describes the docs of. */
function configFolder(ref: NavConfigRef): string {
  return ref.extractor === 'mkdocs' || ref.extractor === 'docusaurus' ? repoJoin(ref.root, 'docs') : ref.root;
}

const under = (path: string, folder: string) => !folder || path === folder || path.startsWith(`${folder}/`);

function command(info: GithubRepoUrlInfo, kind: string): string {
  return `doc-dl detect ${info.rawRepoUrl} --run --only ${kind}`;
}

/**
 * Scans a GitHub repository (or `/tree/<ref>/<path>` subtree) and returns one finding per
 * documentation set: READMEs, doc folders (with their sidebar config), skills, documents,
 * plus informational suggestions (homepage docs site, DeepWiki).
 */
export async function scanRepo(info: GithubRepoUrlInfo, deps: GithubDeps): Promise<Finding[]> {
  const base = { handler: 'github', url: info.rawRepoUrl, confidence: CONFIDENCE };
  let meta: Awaited<ReturnType<GithubDeps['meta']>>;
  let tree: Awaited<ReturnType<GithubDeps['tree']>>;
  try {
    meta = await deps.meta();
    tree = await deps.tree(info.branch || meta.defaultBranch);
  } catch (error: any) {
    const message = String(error?.message ?? error);
    const hint = /\b(403|429)\b|rate limit/i.test(message) ? ' — set GITHUB_TOKEN (or GH_TOKEN) to raise the limit' : '';
    return [{ ...base, kind: 'warning', summary: `GitHub scan failed: ${message}${hint}`, command: '', runnable: false }];
  }

  const ref = info.branch || meta.defaultBranch;
  const scanRoot = info.treePath?.replace(/\/+$/, '') ?? '';
  const paths = tree.files
    .map((f) => f.path)
    .filter((p) => under(p, scanRoot) && !p.includes('node_modules/') && !/(^|\/)\./.test(p));
  const rel = (p: string) => (scanRoot ? p.slice(scanRoot.length + 1) : p);
  const docPaths = paths.filter((p) => DOC_EXT.test(p));
  const findings: Finding[] = [];
  const common = { owner: info.owner, repo: info.repo, ref };

  // READMEs: scan-root README, plus top-level folder READMEs when that folder has no other docs.
  const readmes = docPaths.filter((p) => {
    const r = rel(p);
    if (/^readme\.[a-z]+$/i.test(r)) return true;
    const m = r.match(/^([^/]+)\/readme\.[a-z]+$/i);
    if (!m) return false;
    const folder = repoJoin(scanRoot, m[1]);
    return docPaths.filter((d) => under(d, folder)).length === 1;
  });
  const readmeFinding: Finding | undefined = readmes.length
    ? ({
      ...base,
      kind: 'readme',
      summary: readmes.length === 1 ? readmes[0] : `${readmes[0]} + ${readmes.length - 1} folder README(s)`,
      command: command(info, 'readme'),
      runnable: true,
      details: { ...common, files: readmes },
    })
    : undefined;

  // Doc folders: conventional names and folders described by a sidebar config.
  const configs = findNavConfigs(paths);
  const folders = new Map<string, NavConfigRef | undefined>();
  for (const cfg of configs) folders.set(configFolder(cfg), cfg);
  const topDirs = new Set(paths.map((p) => rel(p).split('/').slice(0, 2)).flatMap((parts) => [parts[0], parts.join('/')]));
  for (const name of DOC_DIRS) {
    const folder = repoJoin(scanRoot, name);
    if (topDirs.has(name) && !folders.has(folder)) folders.set(folder, undefined);
  }
  if (scanRoot && folders.size === 0) folders.set(scanRoot, undefined);
  for (const [folder, cfg] of folders) {
    const files = docPaths.filter((p) => under(p, folder));
    if (!files.length) continue;
    findings.push({
      ...base,
      kind: 'doc-folder',
      summary: `${folder}/ — ${files.length} doc file(s)${cfg ? `, sidebar from ${cfg.configPath}` : ''}`,
      command: command(info, 'doc-folder'),
      runnable: true,
      details: { ...common, folder, navConfig: cfg?.extractor, configPath: cfg?.configPath, files, allPaths: paths },
    });
  }

  // Doc folders are recommended ahead of READMEs.
  if (readmeFinding) findings.push(readmeFinding);

  // Skills
  const skills = paths.filter((p) => /(^|\/)SKILL\.md$/i.test(p)).map((p) => posix.basename(posix.dirname(p)));
  if (skills.length) {
    findings.push({
      ...base,
      kind: 'skills',
      summary: `${skills.length} skill(s): ${skills.slice(0, 5).join(', ')}${skills.length > 5 ? ', …' : ''}`,
      command: command(info, 'skills'),
      runnable: true,
      details: { ...common, skills, tree: scanRoot || undefined },
    });
  }

  // Documents needing conversion
  const documents = paths.filter((p) => DOCUMENT_EXT.test(p));
  if (documents.length) {
    findings.push({
      ...base,
      kind: 'documents',
      summary: `${documents.length} file(s) — need Docling conversion (not yet supported)`,
      command: '',
      runnable: false,
      details: { files: documents },
    });
  }

  // Informational suggestions
  if (meta.homepage && !/github\.com/i.test(meta.homepage)) {
    findings.push({
      ...base,
      kind: 'docs-site',
      url: meta.homepage,
      summary: `Project homepage ${meta.homepage} (may be a docs site)`,
      command: `doc-dl detect ${meta.homepage}`,
      runnable: false,
    });
  }
  findings.push({
    ...base,
    kind: 'wiki',
    url: `https://deepwiki.com/${info.owner}/${info.repo}`,
    summary: 'DeepWiki may have a generated wiki for this repo',
    command: `doc-dl detect https://deepwiki.com/${info.owner}/${info.repo}`,
    runnable: false,
  });
  if (tree.truncated) {
    findings.push({
      ...base,
      kind: 'warning',
      summary: 'GitHub returned an incomplete file list (very large repo); the scan is incomplete',
      command: '',
      runnable: false,
    });
  }
  return findings;
}

function toBlobUrls(nodes: NavNode[], blobBase: string): NavNode[] {
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : blobBase + u.split('/').map(encodeURIComponent).join('/'));
  return nodes.map((n) =>
    n.type === 'link'
      ? { ...n, url: abs(n.url) }
      : n.type === 'folder'
        ? { ...n, ...(n.url ? { url: abs(n.url) } : {}), children: toBlobUrls(n.children, blobBase) }
        : { ...n, children: toBlobUrls(n.children, blobBase) }
  );
}

/** Creates the GitHub template handler. */
export function createGithubTemplate(overrides?: GithubDeps): SourceHandler {
  return {
    id: 'github',

    async detect(probe: Probe): Promise<Finding[]> {
      let host = '';
      try {
        host = new URL(probe.url).hostname;
      } catch {
        return [];
      }
      if (!/^(www\.)?github\.com$/i.test(host)) return [];
      let info: GithubRepoUrlInfo;
      try {
        info = parseGithubUrl(probe.url);
      } catch {
        return [];
      }
      return scanRepo(info, overrides ?? defaultDeps(info));
    },

    async run(finding: Finding, opts: RunOptions): Promise<RunResult> {
      const d = (finding.details ?? {}) as Record<string, any>;
      const info = parseGithubUrl(finding.url);
      const deps = overrides ?? defaultDeps(info);
      const outDir = opts.outputDir ?? resolveOutputDir(info.repo, 'repo');
      const rawBase = `https://raw.githubusercontent.com/${d.owner}/${d.repo}/${d.ref}/`;
      const blobBase = `https://github.com/${d.owner}/${d.repo}/blob/${d.ref}/`;
      const db = new VisitedDatabase(opts.dbPath ?? './docs.db');
      await db.recordSource({ slug: info.repo, name: info.repo, startUrl: info.rawRepoUrl, description: '' });
      let written = 0;
      const warnings: string[] = [];

      const save = async (repoPath: string, target: string, content?: string) => {
        let text: string;
        try {
          text = content ?? (await deps.fetchText(rawBase + repoPath));
        } catch (error: any) {
          warnings.push(`${repoPath}: ${error?.message ?? error}`);
          return;
        }
        const file = join(outDir, target);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, text, 'utf-8');
        await db.recordVisited({
          url: blobBase + repoPath,
          sourceSlug: info.repo,
          relativeFilePath: file,
          title: extractTitleFromContent(text, posix.basename(repoPath)),
          contentHash: computeHash(text),
        });
        written++;
      };

      try {
        if (finding.kind === 'readme') {
          for (const p of d.files as string[]) await save(p, p);
        } else if (finding.kind === 'skills') {
          const { downloadSkill } = await import('../../skills/downloader');
          const res = await downloadSkill({
            repoUrl: info.rawRepoUrl,
            tree: d.tree,
            outputDir: join(outDir, 'skills'),
            dbPath: opts.dbPath,
            force: opts.force,
            debug: opts.debug,
          });
          written += res.totalDownloaded;
        } else if (finding.kind === 'doc-folder') {
          const folder: string = d.folder;
          const files: string[] = d.files;
          let nodes: NavNode[] | undefined;
          if (d.navConfig && d.configPath) {
            const repoFiles = new Map<string, string>((d.allPaths as string[]).map((p) => [p, '']));
            repoFiles.set(d.configPath, await deps.fetchText(rawBase + d.configPath));
            if (d.navConfig === 'fumadocs-meta') {
              for (const p of (d.allPaths as string[]).filter((x) => x.endsWith('meta.json') && under(x, folder))) {
                repoFiles.set(p, await deps.fetchText(rawBase + p));
              }
            }
            const ex = getExtractor(d.navConfig);
            nodes = ex ? await ex.extract({ url: info.rawRepoUrl, repoFiles, configPath: d.configPath }) : [];
            if (!nodes.length) warnings.push(`could not read ${d.configPath}; using folder layout`);
          }

          if (nodes && nodes.length) {
            const folderPrefix = blobBase + folder.split('/').map(encodeURIComponent).join('/') + '/';
            const plan = planLayout(toBlobUrls(nodes, blobBase), {
              baseUrl: blobBase,
              inScope: (u) => u.startsWith(folderPrefix),
            });
            const listed = new Set<string>();
            for (const [url, planned] of plan.paths) {
              const repoPath = decodeURIComponent(url.slice(blobBase.length));
              listed.add(repoPath);
              await save(repoPath, posix.join(folder, planned));
            }
            for (const p of files.filter((f) => !listed.has(f))) {
              await save(p, posix.join(folder, '_unlisted', p.slice(folder.length + 1)));
            }
            const treeFile = join(outDir, folder, '_tree.json');
            await mkdir(dirname(treeFile), { recursive: true });
            await writeFile(
              treeFile,
              JSON.stringify(buildTreeJson(plan, { source: finding.url, framework: d.navConfig }), null, 2),
              'utf-8'
            );
          } else {
            for (const p of files) await save(p, p);
          }
        } else {
          throw new Error(`Finding kind "${finding.kind}" is not runnable`);
        }
      } finally {
        await db.close();
      }
      return { outputDir: outDir, filesWritten: written, warnings };
    },
  };
}
