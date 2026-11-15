import { SourceHandler, Finding, Probe, RunOptions, RunResult } from '../types';

/** Fallback: clip the single page. Always returns one low-confidence finding. */
export const singlePageHandler: SourceHandler = {
  id: 'single-page',
  async detect(probe: Probe): Promise<Finding[]> {
    return [
      {
        handler: 'single-page',
        kind: 'page',
        url: probe.finalUrl,
        confidence: 0.1,
        summary: 'Single page clip',
        command: `doc-dl clip ${probe.finalUrl}`,
        runnable: true,
      },
    ];
  },
  async run(finding: Finding, opts: RunOptions): Promise<RunResult> {
    const { clipPage } = await import('../../scripts/clip');
    const res = await clipPage({ url: finding.url, outputDir: opts.outputDir, dbPath: opts.dbPath, debug: opts.debug });
    return { outputDir: res.filePath.replace(/[/\\][^/\\]+$/, ''), filesWritten: 1, warnings: [] };
  },
};

/** Flags linked PDF/Office/image files; not runnable until a Docling handler exists. */
export const documentsHandler: SourceHandler = {
  id: 'documents',
  async detect(probe: Probe): Promise<Finding[]> {
    if (!probe.fileLinks.length) return [];
    const n = probe.fileLinks.length;
    return [
      {
        handler: 'documents',
        kind: 'documents',
        url: probe.finalUrl,
        confidence: 0.5,
        summary: `${n} file${n === 1 ? '' : 's'} linked — need Docling conversion (not yet supported)`,
        command: '',
        runnable: false,
        details: { files: probe.fileLinks },
      },
    ];
  },
};

/** Reports `llms.txt` and `sitemap.xml` as informational findings. */
export const siteIndexHandler: SourceHandler = {
  id: 'site-index',
  async detect(probe: Probe): Promise<Finding[]> {
    const origin = new URL(probe.finalUrl).origin;
    const out: Finding[] = [];
    if (probe.llmsTxt) {
      const links = (probe.llmsTxt.match(/\]\(/g) || []).length;
      out.push({
        handler: 'site-index',
        kind: 'llms-txt',
        url: `${origin}/llms.txt`,
        confidence: 0.3,
        summary: `page index, ${links} link${links === 1 ? '' : 's'} (no categories)`,
        command: '',
        runnable: false,
      });
    }
    if (probe.sitemapUrls?.length) {
      out.push({
        handler: 'site-index',
        kind: 'sitemap',
        url: `${origin}/sitemap.xml`,
        confidence: 0.3,
        summary: `${probe.sitemapUrls.length.toLocaleString('en-US')} URLs`,
        command: '',
        runnable: false,
      });
    }
    return out;
  },
};
