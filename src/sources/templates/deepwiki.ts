import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { SourceHandler, Finding, Probe, RunOptions, RunResult } from '../types';
import { McpClient, httpMcpClient } from '../mcpClient';
import { NavNode } from '../../nav/types';
import { planLayout, buildTreeJson, slugifyLabel, navUrlKey } from '../../nav/layout';
import { FileStorage } from '../../storage/fileSystem';
import { resolveKnowledgeRoot } from '../../storage/paths';

const MATCH = /^https?:\/\/(www\.)?deepwiki\.com\/([^/?#]+)\/([^/?#]+)/i;
const TOPIC = /^(\s*)-\s+(\d+(?:\.\d+)*)\s+(.+?)\s*$/;

/**
 * Parses DeepWiki's numbered topic list (`- 1 Overview`, `  - 1.1 Architecture`) into a tree.
 * Topics with sub-topics become folders whose own page is the topic.
 */
export function parseDeepwikiStructure(text: string, baseUrl: string): NavNode[] {
  const root: NavNode[] = [];
  const byNumber = new Map<string, Extract<NavNode, { type: 'folder' }>>();
  for (const line of text.split('\n')) {
    const m = line.match(TOPIC);
    if (!m) continue;
    const [, , num, title] = m;
    const url = `${baseUrl}/${num}-${slugifyLabel(title)}`;
    const node: Extract<NavNode, { type: 'folder' }> = { type: 'folder', name: title, url, children: [] };
    byNumber.set(num, node);
    const parent = byNumber.get(num.split('.').slice(0, -1).join('.'));
    (parent ? parent.children : root).push(node);
  }
  // Leaf topics are plain links.
  const finish = (nodes: NavNode[]): NavNode[] =>
    nodes.map((n) =>
      n.type === 'folder' && n.children.length === 0
        ? { type: 'link', name: n.name, url: n.url! }
        : n.type === 'folder'
          ? { ...n, children: finish(n.children) }
          : n
    );
  return finish(root);
}

/** Splits `read_wiki_contents` output into pages keyed by title (`# Page: <Title>` markers). */
export function splitDeepwikiContents(text: string): Map<string, string> {
  const pages = new Map<string, string>();
  const parts = text.split(/^# Page: (.+)$/m);
  for (let i = 1; i < parts.length; i += 2) pages.set(parts[i].trim(), parts[i + 1].trim());
  return pages;
}

function titlesByUrl(nodes: NavNode[], out = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) {
    if (n.type !== 'separator' && n.url) out.set(navUrlKey(n.url, n.url)!, n.name);
    if (n.type !== 'link') titlesByUrl(n.children, out);
  }
  return out;
}

/** DeepWiki template: reads a repo's generated wiki through DeepWiki's public MCP server. */
export function deepwikiTemplate(client: McpClient = httpMcpClient()): SourceHandler {
  return {
    id: 'deepwiki',

    async detect(probe: Probe): Promise<Finding[]> {
      const m = probe.url.match(MATCH);
      if (!m) return [];
      const [, , owner, repo] = m;
      const base = `https://deepwiki.com/${owner}/${repo}`;
      const github: Finding = {
        handler: 'deepwiki',
        kind: 'docs-site',
        url: `https://github.com/${owner}/${repo}`,
        confidence: 0.95,
        summary: 'Source repository on GitHub (READMEs, doc folders, skills)',
        command: `doc-dl detect https://github.com/${owner}/${repo}`,
        runnable: false,
      };
      try {
        const nodes = parseDeepwikiStructure(await client.callTool('read_wiki_structure', { repoName: `${owner}/${repo}` }), base);
        const pages = titlesByUrl(nodes).size;
        if (!pages) throw new Error('no topics returned');
        return [
          {
            handler: 'deepwiki',
            kind: 'wiki',
            url: base,
            confidence: 0.95,
            summary: `DeepWiki · ${nodes.length} sections, ${pages} pages`,
            command: `doc-dl detect ${base} --run`,
            runnable: true,
            details: { owner, repo, pages, sections: nodes.length },
          },
          github,
        ];
      } catch (error: any) {
        return [
          {
            handler: 'deepwiki',
            kind: 'wiki',
            url: base,
            confidence: 0.95,
            summary: `DeepWiki unavailable: ${error?.message ?? error}`,
            command: '',
            runnable: false,
            details: { owner, repo },
          },
          github,
        ];
      }
    },

    async run(finding: Finding, opts: RunOptions): Promise<RunResult> {
      const { owner, repo } = finding.details as { owner: string; repo: string };
      const repoName = `${owner}/${repo}`;
      const outDir = opts.outputDir ?? join(resolveKnowledgeRoot(), 'deepwiki', `${owner}-${repo}`);
      const nodes = parseDeepwikiStructure(await client.callTool('read_wiki_structure', { repoName }), finding.url);
      const pages = splitDeepwikiContents(await client.callTool('read_wiki_contents', { repoName }));
      const plan = planLayout(nodes, { baseUrl: finding.url, inScope: (u) => u.startsWith(finding.url) });
      const titles = titlesByUrl(nodes);
      const storage = new FileStorage(outDir);
      const warnings: string[] = [];
      let written = 0;
      let missing = 0;

      for (const [url, path] of plan.paths) {
        const title = titles.get(url) ?? '';
        const body = pages.get(title);
        if (body === undefined) {
          missing++;
          continue;
        }
        await storage.saveMarkdownAt(path, body, { title, source_url: url });
        written++;
      }
      if (missing) warnings.push(`${missing} page(s) missing from wiki contents`);

      await mkdir(outDir, { recursive: true });
      await writeFile(
        join(outDir, '_tree.json'),
        JSON.stringify(buildTreeJson(plan, { source: finding.url, framework: 'deepwiki' }), null, 2),
        'utf-8'
      );
      return { outputDir: outDir, filesWritten: written, warnings };
    },
  };
}
