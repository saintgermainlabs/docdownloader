import { SourceHandler, Finding, Probe, RunOptions, RunResult } from '../types';
import { detectFrameworks } from '../probe';
import { extractNav } from '../../nav/registry';
import { NavNode } from '../../nav/types';

const DOCS_PATH = /\/(docs|documentation|guide|manual)(\/|$)/i;

function countPages(nodes: NavNode[]): number {
  return nodes.reduce((n, node) => n + (node.type === 'link' ? 1 : (node.type === 'folder' && node.url ? 1 : 0) + countPages(node.children)), 0);
}

async function renderWithBrowser(url: string): Promise<string> {
  const { BrowserManager } = await import('../../crawler/browser');
  const browser = new BrowserManager();
  await browser.init();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 500));
    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * Docs-site handler: recognises documentation sites (framework fingerprints, sidebar tree,
 * or a docs-like path) and runs the sidebar-aware crawler.
 *
 * @param deps.render - Renders a JS-only page to HTML (default: Playwright).
 */
export function createDocsSiteHandler(deps: { render?: (url: string) => Promise<string> } = {}): SourceHandler {
  const render = deps.render ?? renderWithBrowser;
  return {
    id: 'docs-site',

    async detect(probe: Probe): Promise<Finding[]> {
      let html = probe.html ?? '';
      let frameworks = probe.frameworks;
      if (probe.needsBrowser) {
        try {
          html = await render(probe.finalUrl);
          frameworks = detectFrameworks(html);
        } catch (error: any) {
          const reason = String(error?.message ?? error).split('\n')[0];
          return [
            {
              handler: 'docs-site',
              kind: 'warning',
              url: probe.finalUrl,
              confidence: 0.2,
              summary:
                `This page needs a browser to render, but none could start (${reason}). ` +
                'Run `npx playwright install chromium` or set DOC_DL_BROWSER_CHANNEL=chrome, then detect again.',
              command: '',
              runnable: false,
            },
          ];
        }
      }
      const nav = html ? await extractNav({ html, url: probe.finalUrl }) : null;
      const docsPath = DOCS_PATH.test(new URL(probe.finalUrl).pathname);
      if (!frameworks.length && !nav && !docsPath) return [];

      const framework = nav?.framework ?? frameworks[0];
      const sections = nav ? nav.nodes.filter((n) => n.type !== 'link').length : 0;
      const pages = nav ? countPages(nav.nodes) : 0;
      const label = framework ? framework[0].toUpperCase() + framework.slice(1) : 'Docs site';
      const summary = nav
        ? `${label} · sidebar tree found: ${sections} sections, ${pages} pages`
        : `${label} · no sidebar tree detected (URL layout)`;
      return [
        {
          handler: 'docs-site',
          kind: 'docs-site',
          url: probe.finalUrl,
          confidence: frameworks.length || nav ? 0.9 : 0.6,
          summary,
          command: `doc-dl crawl ${probe.finalUrl}`,
          runnable: true,
          details: { framework, sections, pages },
        },
      ];
    },

    async run(finding: Finding, opts: RunOptions): Promise<RunResult> {
      const { main } = await import('../../index');
      const summary = await main(
        finding.url,
        opts.outputDir,
        'subfolder',
        opts.concurrency ?? 3,
        opts.dbPath,
        opts.force ?? false,
        undefined,
        undefined,
        undefined,
        opts.debug,
        opts.layout ?? 'nav'
      );
      return { outputDir: summary.outputDir, filesWritten: summary.downloaded, warnings: summary.warnings };
    },
  };
}
