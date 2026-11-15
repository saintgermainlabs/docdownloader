#!/usr/bin/env node
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { BrowserManager } from '../crawler/browser';
import { MarkdownConverter } from '../converter/markdown';
import { VisitedDatabase, computeHash } from '../storage/database';
import { resolveClippingDir } from '../storage/paths';
import { logger, isDebugEnabled, setDebugMode } from '../utils/logger';

/**
 * CLI options for the single-page clipping command.
 */
export interface ClipCliOptions {
  /** Page URL to clip */
  url: string;
  /** Destination directory override (default: knowledge/clippings) */
  outputDir?: string;
  /** Optional output filename (without or with .md) */
  filename?: string;
  /** Optional title override for frontmatter / filename */
  title?: string;
  /** SQLite database path (default: ./docs.db) */
  dbPath: string;
  /** Skip writing to docs.db */
  noDb: boolean;
  /** Help requested */
  help: boolean;
  /** Enable verbose debug logging */
  debug: boolean;
}

/**
 * Result of a successful clip operation.
 */
export interface ClipResult {
  url: string;
  title: string;
  filePath: string;
  markdown: string;
}

/**
 * Parses CLI arguments for `npm run clip`.
 *
 * @param argv - Argument strings after the node/script path.
 * @returns Parsed {@link ClipCliOptions}.
 */
export function parseClipCliArgs(argv: string[]): ClipCliOptions {
  let url = '';
  let outputDir: string | undefined;
  let filename: string | undefined;
  let title: string | undefined;
  let dbPath = './docs.db';
  let noDb = false;
  let help = false;
  let debug = isDebugEnabled();

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-d' || arg === '--debug' || arg === '--verbose') {
      debug = true;
    } else if (arg.startsWith('--debug=') || arg.startsWith('--verbose=')) {
      const val = arg.split('=')[1]?.toLowerCase();
      debug = val === 'true' || val === '1' || val === 'yes';
    } else if (arg === '--no-db') {
      noDb = true;
    } else if (arg === '--db' || arg === '--database') {
      dbPath = argv[++i];
    } else if (arg.startsWith('--db=') || arg.startsWith('--database=')) {
      dbPath = arg.split('=')[1];
    } else if (arg === '--out' || arg === '--output' || arg === '-o') {
      outputDir = argv[++i];
    } else if (arg.startsWith('--out=') || arg.startsWith('--output=')) {
      outputDir = arg.split('=')[1];
    } else if (arg === '--filename' || arg === '--file' || arg === '-f') {
      filename = argv[++i];
    } else if (arg.startsWith('--filename=') || arg.startsWith('--file=')) {
      filename = arg.split('=')[1];
    } else if (arg === '--title' || arg === '-t') {
      title = argv[++i];
    } else if (arg.startsWith('--title=')) {
      title = arg.split('=')[1];
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  if (positionals.length > 0) {
    url = positionals[0];
  }
  if (positionals.length > 1 && !outputDir) {
    outputDir = positionals[1];
  }

  return { url, outputDir, filename, title, dbPath, noDb, help, debug };
}

/** Minimum share of the page's text the main-content element must hold to be used instead of `<body>`. */
const MAIN_CONTENT_MIN_SHARE = 0.3;

/**
 * Picks the main-content element among candidates (by text length). Returns -1 to use the whole
 * body: when there are no candidates, or the best one holds less than 30% of the page's text
 * (e.g. Redoc, where many small `<article>` boxes exist but none is the page).
 */
export function chooseMainContent(candidates: Array<{ textLength: number }>, bodyTextLength: number): number {
  let best = -1;
  candidates.forEach((c, i) => {
    if (best === -1 || c.textLength > candidates[best].textLength) best = i;
  });
  if (best === -1) return -1;
  const length = candidates[best].textLength;
  if (length <= 80 || length < bodyTextLength * MAIN_CONTENT_MIN_SHARE) return -1;
  return best;
}

/**
 * Turns a string into a filesystem-safe slug.
 *
 * @param input - Raw title or path fragment.
 * @returns Lowercase hyphenated slug.
 */
export function slugifyClipName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'clip';
}

/**
 * Builds a default clipping filename from the page URL and optional title.
 *
 * @param url - Source page URL.
 * @param title - Optional document title.
 * @returns Filename ending in `.md`.
 */
export function defaultClipFilename(url: string, title?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  let base = title?.trim() || '';
  if (!base) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      base = parts.length > 0 ? parts[parts.length - 1] : parsed.hostname;
    } catch {
      base = 'clip';
    }
  }
  return `${date}-${slugifyClipName(base)}.md`;
}

/**
 * Wraps Markdown body with clipping frontmatter.
 *
 * @param title - Document title.
 * @param url - Source URL.
 * @param body - Converted Markdown body.
 * @returns Full file contents.
 */
export function wrapClippingMarkdown(title: string, url: string, body: string): string {
  const clipped = new Date().toISOString();
  const safeTitle = title.replace(/"/g, '\\"');
  return [
    '---',
    `title: "${safeTitle}"`,
    `source: ${url}`,
    'type: clipping',
    `clipped: ${clipped}`,
    '---',
    '',
    body.trim(),
    '',
  ].join('\n');
}

/**
 * Opens a single URL in Playwright, converts the main content to Markdown, and saves a clipping.
 *
 * @param options - Clip options.
 * @returns {@link ClipResult} with saved path and content.
 */
export async function clipPage(options: {
  url: string;
  outputDir?: string;
  filename?: string;
  title?: string;
  dbPath?: string;
  noDb?: boolean;
  debug?: boolean;
}): Promise<ClipResult> {
  if (options.debug !== undefined) {
    setDebugMode(options.debug);
  }

  const targetUrl = options.url.trim();
  if (!targetUrl) {
    throw new Error('URL is required');
  }
  const parsedUrl = new URL(targetUrl);

  const outDir = resolveClippingDir(options.outputDir);
  logger.debug('CLIP', `Target URL: ${targetUrl}`);
  logger.debug('CLIP', `Resolved clipping output dir: ${outDir}`);

  const browser = new BrowserManager();
  const converter = new MarkdownConverter();

  logger.step('BROWSER', 'Initializing headless browser for clipping...');
  await browser.init();
  const page = await browser.newPage();

  try {
    logger.debug('CLIP', `Navigating to ${parsedUrl.toString()} (timeout: 30s)...`);
    const navStart = Date.now();
    await page.goto(parsedUrl.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    logger.debug('CLIP', `Page DOM loaded in ${Date.now() - navStart}ms`);

    // Give SPAs a short settle window without failing on long-polling pages.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pageTitle = (options.title?.trim() || (await page.title()) || parsedUrl.hostname).trim();
    logger.debug('CLIP', `Resolved page title: "${pageTitle}"`);

    logger.debug('CLIP', 'Extracting article/main content from DOM...');
    const SELECTORS = [
      'article',
      'main',
      '[role="main"]',
      '.markdown-body',
      '.md-content',
      '.docMainContainer',
      '.theme-doc-markdown',
      '#content',
      '.content',
    ];
    const measured = await page.evaluate((selectors: string[]) => {
      const candidates: Array<{ selector: string; index: number; textLength: number }> = [];
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el, index) => {
          candidates.push({ selector, index, textLength: ((el as HTMLElement).innerText || '').trim().length });
        });
      }
      return { candidates, bodyTextLength: (document.body?.innerText || '').trim().length };
    }, SELECTORS);
    const picked = chooseMainContent(measured.candidates, measured.bodyTextLength);
    const target = picked >= 0 ? measured.candidates[picked] : undefined;
    logger.debug('CLIP', target ? `Main content: ${target.selector}[${target.index}]` : 'Main content: <body>');
    const contentHtml = await page.evaluate(
      (t: { selector: string; index: number } | undefined) =>
        t ? (document.querySelectorAll(t.selector)[t.index] as HTMLElement).innerHTML : document.body?.innerHTML || '',
      target ? { selector: target.selector, index: target.index } : undefined
    );
    logger.debug('CLIP', `Extracted content HTML length: ${contentHtml.length} characters`);

    logger.debug('CLIP', 'Converting HTML to Markdown...');
    const bodyMarkdown = converter.convert(contentHtml);
    const markdown = wrapClippingMarkdown(pageTitle, parsedUrl.toString(), bodyMarkdown);
    logger.debug('CLIP', `Generated Markdown length: ${markdown.length} characters`);

    const fileName = (options.filename?.endsWith('.md')
      ? options.filename
      : options.filename
        ? `${options.filename}.md`
        : defaultClipFilename(parsedUrl.toString(), pageTitle)
    ).replace(/^\//, '');

    await mkdir(outDir, { recursive: true });
    const filePath = join(outDir, fileName);
    logger.debug('CLIP', `Writing clipping note to disk: ${filePath}`);
    await writeFile(filePath, markdown, 'utf-8');

    if (!options.noDb) {
      const finalDbPath = options.dbPath || './docs.db';
      logger.debug('CLIP', `Recording clipping in SQLite database: ${finalDbPath}`);
      const db = new VisitedDatabase(finalDbPath);
      try {
        await db.recordSource({
          slug: 'clippings',
          name: 'Clippings',
          startUrl: 'clippings://local',
          description: 'Single-page web clippings',
        });
        await db.recordVisited({
          url: parsedUrl.toString(),
          sourceSlug: 'clippings',
          relativeFilePath: filePath,
          title: pageTitle,
          contentHash: computeHash(markdown),
        });
      } finally {
        await db.close();
      }
    }

    logger.success(`Saved clipping note: ${filePath}`);

    return {
      url: parsedUrl.toString(),
      title: pageTitle,
      filePath,
      markdown,
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close();
  }
}

/**
 * Prints help for the clipping CLI.
 */
export function printClipHelp(): void {
  console.log(`
ai-doc-downloader clip - Single-page web clipping to Markdown

USAGE:
  npm run clip -- <url> [outputDir] [options]
  node dist/src/scripts/clip.js <url> [outputDir] [options]

ARGUMENTS:
  <url>                 Page URL to open in Playwright and convert
  [outputDir]           Destination directory (default: <knowledge-root>/clippings,
                        i.e. ./output/clippings unless KNOWLEDGE_ROOT is set)

OPTIONS:
  --out, -o <dir>       Output directory override
  --filename, -f <name> Output filename (with or without .md)
  --title, -t <title>   Override page title (frontmatter + default filename)
  --db <path>           SQLite database path (default: ./docs.db)
  --no-db               Do not record the clip in docs.db
  --debug, -d           Enable verbose step-by-step debug logging
  --help, -h            Show this help

ENVIRONMENT:
  DEBUG=1, DDOCS_DEBUG=1 Enable verbose debug logging
  HOST_ENV=remote       Use /srv/knowledge as the knowledge root (unless KNOWLEDGE_ROOT is set)
  KNOWLEDGE_ROOT=<path> Override knowledge root (clippings go to <path>/clippings)

EXAMPLES:
  npm run clip -- "https://example.com/blog/some-article"
  npm run clip -- "https://example.com/post" --debug
  HOST_ENV=remote npm run clip -- "https://example.com/post" --title "Example Post"
`);
}

async function runCli(): Promise<void> {
  const options = parseClipCliArgs(process.argv.slice(2));

  if (options.help || !options.url) {
    printClipHelp();
    process.exit(options.url || options.help ? 0 : 1);
  }

  if (options.debug) {
    setDebugMode(true);
  }

  console.log(`Clipping: ${options.url}`);
  const result = await clipPage({
    url: options.url,
    outputDir: options.outputDir,
    filename: options.filename,
    title: options.title,
    dbPath: options.dbPath,
    noDb: options.noDb,
    debug: options.debug,
  });
  console.log(`Saved: ${result.filePath}`);
  console.log(`Title: ${result.title}`);
}

if (require.main === module) {
  runCli().catch((error) => {
    logger.error('CLIP', `Clipping failed: ${error.message}`, error);
    process.exit(1);
  });
}
