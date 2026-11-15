import { join } from 'path';
import { BrowserManager } from './crawler/browser';
import { CrawlerQueue } from './crawler/queue';
import { normalizeUrl, isUrlInScope, CrawlScope } from './crawler/urlUtils';
import { MarkdownConverter } from './converter/markdown';
import { FileStorage } from './storage/fileSystem';
import { VisitedDatabase, computeHash, extractDefaultSlug } from './storage/database';
import { resolveOutputDir, resolveSkillsDir, resolveClippingDir, resolveKnowledgeRoot, DEFAULT_OUTPUT_ROOT } from './storage/paths';
import { logger, isDebugEnabled, setDebugMode, colors } from './utils/logger';
import { writeFile, mkdir } from 'fs/promises';
import { relative } from 'path';
import { extractNav } from './nav/registry';
import { planLayout, buildTreeJson } from './nav/layout';
import { matchPlannedPath, unlistedPath, shouldSavePage, relocateIfMoved, redirectTarget } from './nav/crawlLayout';
import { LayoutPlan } from './nav/types';

/** Totals returned by {@link main}. */
export interface CrawlSummary {
  outputDir: string;
  processed: number;
  downloaded: number;
  skipped: number;
  httpErrors: number;
  errors: number;
  warnings: string[];
}

/** How crawled pages are laid out on disk: by sidebar tree (`nav`) or by URL path (`url`). */
export type CrawlLayout = 'nav' | 'url';

export { downloadSkill } from './skills/downloader';
export { SkillDownloadOptions, SkillDownloadResult, SkillFileEntry, DownloadedSkillFile } from './skills/types';
export { downloadGithubDocs } from './github_docs/downloader';
export { resolveSkillsDir, resolveClippingDir, resolveKnowledgeRoot, resolveOutputDir };

/**
 * Parsed CLI options for the primary `ai-doc-downloader` web crawler.
 */
export interface CliOptions {
  /** Target seed URL string */
  url: string;
  /** Base destination directory */
  outputDir: string;
  /** Crawl scope constraint (`'subfolder'` or `'website'`) */
  scope: CrawlScope;
  /** Parallel worker count */
  concurrency: number;
  /** Optional custom SQLite database path */
  dbPath?: string;
  /** Force re-downloading previously visited pages */
  force: boolean;
  /** Human-readable source name */
  name?: string;
  /** Summary description of the documentation source */
  description?: string;
  /** Custom source slug */
  slug?: string;
  /** Whether help was requested */
  help: boolean;
  /** Enable verbose step-by-step debug logging */
  debug: boolean;
  /** On-disk layout: sidebar tree (`nav`, default) or URL path (`url`) */
  layout: CrawlLayout;
}

/**
 * Parses command-line arguments for the primary crawler CLI.
 *
 * @param argv - Array of command-line argument strings.
 * @returns Parsed {@link CliOptions} object.
 */
export function parseCliArgs(argv: string[]): CliOptions {
  let url = '';
  let outputDir = '';
  let scope: CrawlScope = 'subfolder';
  let concurrency = 1;
  let dbPath: string | undefined;
  let force = false;
  let name: string | undefined;
  let description: string | undefined;
  let slug: string | undefined;
  let help = false;
  let debug = isDebugEnabled();
  let layout: CrawlLayout = 'nav';

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-f' || arg === '--force') {
      force = true;
    } else if (arg === '-d' || arg === '--debug' || arg === '--verbose') {
      debug = true;
    } else if (arg.startsWith('--debug=') || arg.startsWith('--verbose=')) {
      const val = arg.split('=')[1]?.toLowerCase();
      debug = val === 'true' || val === '1' || val === 'yes';
    } else if (arg === '--out' || arg === '--output' || arg === '-o') {
      outputDir = argv[++i];
    } else if (arg.startsWith('--out=') || arg.startsWith('--output=')) {
      outputDir = arg.split('=')[1];
    } else if (arg === '--db' || arg === '--database') {
      dbPath = argv[++i];
    } else if (arg.startsWith('--db=') || arg.startsWith('--database=')) {
      dbPath = arg.split('=')[1];
    } else if (arg === '--name') {
      name = argv[++i];
    } else if (arg.startsWith('--name=')) {
      name = arg.split('=')[1];
    } else if (arg === '--description' || arg === '--desc') {
      description = argv[++i];
    } else if (arg.startsWith('--description=') || arg.startsWith('--desc=')) {
      description = arg.split('=')[1];
    } else if (arg === '--layout') {
      const val = argv[++i];
      if (val === 'nav' || val === 'url') layout = val;
    } else if (arg.startsWith('--layout=')) {
      const val = arg.split('=')[1];
      if (val === 'nav' || val === 'url') layout = val;
    } else if (arg === '--slug') {
      slug = argv[++i];
    } else if (arg.startsWith('--slug=')) {
      slug = arg.split('=')[1];
    } else if (arg === '--concurrency' || arg === '-c') {
      const val = parseInt(argv[++i], 10);
      if (!isNaN(val) && val > 0) {
        concurrency = val;
      }
    } else if (arg.startsWith('--concurrency=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) {
        concurrency = val;
      }
    } else if (arg === '--scope' || arg === '-s' || arg === '--mode' || arg === '-m') {
      const val = argv[++i]?.toLowerCase();
      if (val === 'website' || val === 'site' || val === 'all' || val === 'whole') {
        scope = 'website';
      } else if (val === 'subfolder' || val === 'sub' || val === 'subpath') {
        scope = 'subfolder';
      }
    } else if (arg.startsWith('--scope=') || arg.startsWith('--mode=')) {
      const val = arg.split('=')[1]?.toLowerCase();
      if (val === 'website' || val === 'site' || val === 'all' || val === 'whole') {
        scope = 'website';
      } else if (val === 'subfolder' || val === 'sub' || val === 'subpath') {
        scope = 'subfolder';
      }
    } else if (arg === '--subfolder' || arg === '--sub') {
      scope = 'subfolder';
    } else if (arg === '--website' || arg === '--whole-website' || arg === '--site') {
      scope = 'website';
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  const parseScope = (val: string): CrawlScope | undefined => {
    const v = val.toLowerCase();
    if (v === 'website' || v === 'site' || v === 'all' || v === 'whole') return 'website';
    if (v === 'subfolder' || v === 'sub' || v === 'subpath') return 'subfolder';
    return undefined;
  };

  // Positionals: <url> [outputDir] [scope]; a scope keyword may also directly follow the URL.
  if (positionals.length > 0) {
    url = positionals[0];
  }
  for (const extra of positionals.slice(1)) {
    const asScope = parseScope(extra);
    if (asScope) {
      scope = asScope;
    } else if (!outputDir) {
      outputDir = extra;
    }
  }
  if (!outputDir) {
    outputDir = DEFAULT_OUTPUT_ROOT;
  }

  return { url, outputDir, scope, concurrency, dbPath, force, name, description, slug, help, debug, layout };
}

/**
 * Main application entrypoint for executing web documentation crawls.
 *
 * @param startUrl - Initial URL to start crawling from.
 * @param outputDir - Destination directory. `./output` (the default) means "auto": `<base>/<slug>` resolved via `resolveOutputDir`.
 * @param scope - Crawl scope constraint (`'subfolder'` or `'website'`).
 * @param concurrency - Number of parallel Playwright browser workers.
 * @param dbPath - SQLite database tracking path (default: `./docs.db`).
 * @param force - Force re-downloading previously recorded URLs.
 * @param name - Human-readable documentation source name.
 * @param description - Summary description of the documentation source.
 * @param slug - Source slug key.
 * @param debug - Enable verbose step-by-step debug logging.
 * @param layout - `nav` (default): save pages by sidebar tree when one is found; `url`: by URL path.
 */
export async function main(
  startUrl: string,
  outputDir: string = DEFAULT_OUTPUT_ROOT,
  scope: CrawlScope = 'subfolder',
  concurrency: number = 1,
  dbPath?: string,
  force: boolean = false,
  name?: string,
  description?: string,
  slug?: string,
  debug?: boolean,
  layout: CrawlLayout = 'nav'
): Promise<CrawlSummary> {
  if (!startUrl) {
    throw new Error('Missing required positional argument: startUrl');
  }

  if (debug !== undefined) {
    setDebugMode(debug);
  }

  const startTime = Date.now();
  const finalDbPath = dbPath || './docs.db';

  if (isDebugEnabled()) {
    logger.banner('ddocs crawl: Web Documentation Crawler [DEBUG ACTIVE]');
    logger.debug('CONFIG', `Seed URL: ${startUrl}`);
    logger.debug('CONFIG', `Scope: ${scope}`);
    logger.debug('CONFIG', `Concurrency: ${concurrency}`);
    logger.debug('CONFIG', `Output Dir: ${outputDir}`);
    logger.debug('CONFIG', `Database: ${finalDbPath}`);
    logger.debug('CONFIG', `Force re-crawl: ${force ? 'YES' : 'NO'}`);
    logger.debug('CONFIG', `Node: ${process.version} | PID: ${process.pid} | Platform: ${process.platform}`);
    logger.debug('CONFIG', `HOST_ENV: ${process.env.HOST_ENV || '(unset)'} | KNOWLEDGE_ROOT: ${process.env.KNOWLEDGE_ROOT || '(unset)'}`);
  }

  logger.step('DATABASE', `Connecting to SQLite index: ${finalDbPath}`);
  const db = new VisitedDatabase(finalDbPath);

  const sourceSlug = slug || extractDefaultSlug(startUrl);
  const sourceName = name || new URL(startUrl).hostname;
  const sourceDesc = description || '';
  const finalOutputDir = resolveOutputDir(sourceSlug, 'repo', 'awesome', outputDir);

  logger.debug('DATABASE', `Registering source metadata: slug="${sourceSlug}", name="${sourceName}"`);
  await db.recordSource({
    slug: sourceSlug,
    name: sourceName,
    startUrl,
    description: sourceDesc
  });

  const existingVisited = await db.getAllVisited(sourceSlug);
  logger.debug('DATABASE', `Source "${sourceSlug}" has ${existingVisited.length} previously indexed page(s)`);
  logger.debug('STORAGE', `Final target output directory: ${finalOutputDir}`);

  logger.step('BROWSER', 'Launching headless Chromium browser instance...');
  const browser = new BrowserManager();
  const queue = new CrawlerQueue({ db, force });
  const converter = new MarkdownConverter();
  const storage = new FileStorage(finalOutputDir);

  await browser.init();

  const initialUrl = normalizeUrl(startUrl, startUrl) || startUrl;
  queue.add(initialUrl);
  logger.debug('QUEUE', `Enqueued initial seed URL: ${initialUrl} (Queue length: ${queue.size})`);

  const warnings: string[] = [];
  let navPlan: LayoutPlan | undefined;
  let navFramework = '';
  if (layout === 'nav') {
    navPlan = await planNavLayout(browser, initialUrl, startUrl, scope);
    if (navPlan) {
      navFramework = (navPlan as LayoutPlan & { framework?: string }).framework || '';
      for (const planned of navPlan.paths.keys()) queue.add(planned);
      logger.step('NAV', `Sidebar tree found (${navFramework}): ${navPlan.paths.size} page(s) planned`);
    } else {
      logger.warn('NAV', 'no sidebar tree found; using URL layout');
      warnings.push('no sidebar tree found; using URL layout');
    }
  }

  const targetPathFor = (pageUrl: string): string | undefined => {
    if (!navPlan) return undefined;
    return matchPlannedPath(navPlan, pageUrl) ?? unlistedPath(new URL(pageUrl));
  };

  let activeWorkers = 0;
  let totalProcessed = 0;
  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalHttpErrors = 0;

  const workerCount = Math.max(1, concurrency);
  logger.step('WORKERS', `Spawning ${workerCount} concurrent crawler worker(s)...`);

  try {
    async function worker(workerId: number) {
      logger.debug('WORKER', `Worker #${workerId} ready and listening for queue tasks`);
      while (true) {
        const url = queue.next();
        if (!url) {
          if (activeWorkers === 0) {
            logger.debug('WORKER', `Worker #${workerId} queue empty and 0 active workers. Exiting.`);
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
          if (queue.isEmpty() && activeWorkers === 0) {
            logger.debug('WORKER', `Worker #${workerId} confirmed queue empty. Exiting.`);
            break;
          }
          continue;
        }

        activeWorkers++;
        totalProcessed++;
        const workerStartTime = Date.now();
        const isVisited = !force && await db.hasVisited(url);

        if (isVisited) {
          totalSkipped++;
          if (isDebugEnabled()) {
            logger.worker(workerId, `[SKIP-DB] Already in database: ${url}`);
          } else {
            console.log(`Skipping download (already in database): ${url}`);
          }
        } else {
          totalDownloaded++;
          if (isDebugEnabled()) {
            logger.worker(workerId, `[PROCESS] Starting download: ${url} (Queue remaining: ${queue.size})`);
          } else {
            console.log(`Processing [active: ${activeWorkers}]: ${url}`);
          }
        }

        let page = null;

        try {
          logger.debug(`W#${workerId}`, `Creating browser page for ${url}`);
          page = await browser.newPage();

          if (isDebugEnabled()) {
            page.on('console', (msg) => {
              const type = msg.type();
              if (type === 'error' || type === 'warning') {
                logger.debug('PAGE-CONSOLE', `[${type}] ${msg.text()}`);
              }
            });
            page.on('pageerror', (err) => {
              logger.debug('PAGE-ERROR', `${err.message}`);
            });
            page.on('requestfailed', (req) => {
              logger.debug('NET-FAIL', `${req.url()} (${req.failure()?.errorText || 'failed'})`);
            });
          }

          logger.debug(`W#${workerId}`, `Navigating to ${url} (timeout: 20000ms, waitUntil: domcontentloaded)...`);
          const navStart = Date.now();
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          const navTime = Date.now() - navStart;
          const status = response ? response.status() : 'cached/unknown';
          logger.debug(`W#${workerId}`, `Page loaded in ${navTime}ms (HTTP ${status}) -> ${page.url()}`);

          if (!shouldSavePage(response ? response.status() : undefined)) {
            totalHttpErrors++;
            logger.warn(`W#${workerId}`, `HTTP ${status} for ${url}; not saved`);
            continue;
          }

          // A redirect alias is not saved: the final page is crawled under its own URL instead.
          const redirectedTo = redirectTarget(url, page.url());
          if (redirectedTo) {
            if (!isVisited) totalDownloaded--;
            if (isUrlInScope(redirectedTo, startUrl, scope)) queue.add(redirectedTo);
            logger.debug(`W#${workerId}`, `[REDIRECT] ${url} -> ${redirectedTo}; queued final URL, alias not saved`);
            continue;
          }

          const targetPath = targetPathFor(url);
          if (isVisited && targetPath) {
            const record = await db.getRecord(url);
            if (record) {
              const oldRel = relative(finalOutputDir, record.relativeFilePath);
              if (await relocateIfMoved(finalOutputDir, oldRel, targetPath)) {
                await db.recordVisited({ ...record, relativeFilePath: join(finalOutputDir, targetPath) });
                logger.debug(`W#${workerId}`, `Moved ${oldRel} -> ${targetPath} (sidebar changed)`);
              }
            }
          }

          // Settle window for dynamic SPA components
          await new Promise((r) => setTimeout(r, 200));

          if (!isVisited) {
            logger.debug(`W#${workerId}`, `Extracting DOM content from ${url}...`);
            const content = await page.content();
            const pageTitle = (await page.title()) || '';
            logger.debug(`W#${workerId}`, `Extracted ${content.length} chars of HTML. Title: "${pageTitle}"`);

            logger.debug(`W#${workerId}`, `Converting HTML to Markdown...`);
            const markdown = converter.convert(content);
            logger.debug(`W#${workerId}`, `Converted to ${markdown.length} chars of Markdown`);

            logger.debug(`W#${workerId}`, `Saving Markdown file to storage...`);
            const saved = targetPath
              ? await storage.saveMarkdownAt(targetPath, markdown, { title: pageTitle, source_url: url })
              : await storage.saveMarkdown(new URL(url), markdown);
            const hash = computeHash(markdown);
            logger.debug(`W#${workerId}`, `Saved file: ${saved.relativeFilePath} (SHA-256: ${hash.substring(0, 12)}...)`);

            await db.recordVisited({
              url,
              sourceSlug,
              relativeFilePath: saved.relativeFilePath,
              title: pageTitle,
              contentHash: hash
            });
            logger.debug(`W#${workerId}`, `Recorded visited entry in SQLite docs.db`);
          }

          logger.debug(`W#${workerId}`, `Discovering hyperlinks from page anchor elements...`);
          const links = await page.$$eval('a', (as) => as.map((a) => a.href));
          logger.debug(`W#${workerId}`, `Found ${links.length} raw anchor link(s) on ${url}`);

          let inScopeCount = 0;
          let newlyQueuedCount = 0;

          for (const link of links) {
            const normalized = normalizeUrl(url, link);
            if (!normalized) {
              logger.debug(`W#${workerId}`, `[LINK-INVALID] Could not parse: "${link}"`);
              continue;
            }

            const inScope = isUrlInScope(normalized, startUrl, scope);
            if (inScope) {
              inScopeCount++;
              const added = queue.add(normalized);
              if (added) {
                newlyQueuedCount++;
                logger.debug(`W#${workerId}`, `[LINK-IN-SCOPE:NEW] ${normalized}`);
              } else {
                logger.debug(`W#${workerId}`, `[LINK-IN-SCOPE:SEEN] ${normalized}`);
              }
            } else {
              logger.debug(`W#${workerId}`, `[LINK-OUT-OF-SCOPE] ${normalized} (Scope: ${scope})`);
            }
          }

          logger.debug(
            `W#${workerId}`,
            `Link discovery for ${url}: ${links.length} total, ${inScopeCount} in-scope, ${newlyQueuedCount} newly enqueued`
          );

          const elapsed = Date.now() - workerStartTime;
          logger.debug(`W#${workerId}`, `Finished ${url} in ${elapsed}ms (Queue remaining: ${queue.size})`);
        } catch (error: any) {
          totalErrors++;
          logger.error(`WORKER #${workerId}`, `Failed processing ${url}: ${error.message}`, error);
        } finally {
          if (page) {
            try {
              await page.close();
            } catch {
              // ignore page close errors
            }
          }
          activeWorkers--;
        }
      }
      logger.debug('WORKER', `Worker #${workerId} finished`);
    }

    const workers = Array.from({ length: workerCount }, (_, i) => worker(i + 1));
    await Promise.all(workers);

    if (navPlan) {
      await mkdir(finalOutputDir, { recursive: true });
      const treeJson = buildTreeJson(navPlan, { source: startUrl, framework: navFramework });
      await writeFile(join(finalOutputDir, '_tree.json'), JSON.stringify(treeJson, null, 2), 'utf-8');
      logger.debug('NAV', `Wrote ${finalOutputDir}/_tree.json`);
    }
  } finally {
    logger.step('CLEANUP', 'Closing browser instance and SQLite database...');
    await browser.close();
    await db.close();

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.step('COMPLETE', `Documentation crawl finished in ${elapsedSeconds}s`);
    logger.info(
      `Summary: ${totalProcessed} total URLs processed (${totalDownloaded} downloaded, ${totalSkipped} skipped), ${totalHttpErrors} HTTP error page(s) not saved, ${totalErrors} error(s)`
    );
    logger.info(`Output Directory: ${finalOutputDir}`);
    logger.info(`SQLite Database:  ${finalDbPath}`);
  }
  return {
    outputDir: finalOutputDir,
    processed: totalProcessed,
    downloaded: totalDownloaded,
    skipped: totalSkipped,
    httpErrors: totalHttpErrors,
    errors: totalErrors,
    warnings,
  };
}

/**
 * Loads the start page once and plans a sidebar-tree layout for the crawl.
 *
 * @returns The plan (with `framework` attached), or `undefined` if no tree was found.
 */
async function planNavLayout(
  browser: BrowserManager,
  initialUrl: string,
  startUrl: string,
  scope: CrawlScope
): Promise<(LayoutPlan & { framework: string }) | undefined> {
  const page = await browser.newPage();
  try {
    const response = await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (response && response.status() >= 400) return undefined;
    await new Promise((r) => setTimeout(r, 200));
    const html = await page.content();
    const nav = await extractNav({ html, page, url: page.url() });
    if (!nav) return undefined;
    const plan = planLayout(nav.nodes, {
      baseUrl: page.url(),
      inScope: (u) => isUrlInScope(u, startUrl, scope),
    });
    if (plan.paths.size === 0) return undefined;
    return Object.assign(plan, { framework: nav.framework });
  } catch (error: any) {
    logger.debug('NAV', `Sidebar extraction failed: ${error.message}`);
    return undefined;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Prints comprehensive help information for the primary crawler CLI.
 */
export function printMainCliHelp(): void {
  console.log(`
ai-doc-downloader - TypeScript Web Documentation Harvester

USAGE:
  ddocs crawl <url> [outputDir] [scope] [options]
  npm start -- <url> [outputDir] [scope] [options]
  node dist/src/index.js <url> [outputDir] [scope] [options]

ARGUMENTS:
  <url>                         (Mandatory) Base seed URL to crawl (e.g. https://docs.openclaw.ai/)
  [outputDir]                   (Optional) Directory to save Markdown files. Default: <knowledge-root>/<slug>
                                (./output/<slug> unless KNOWLEDGE_ROOT / HOST_ENV is set)
  [scope]                       (Optional) Crawl scope: 'subfolder' or 'website' (default: subfolder)

OPTIONS:
  --concurrency, -c <N>         Number of parallel Playwright workers (default: 1)
  --scope, -s, --mode, -m <M>   Set scope: 'subfolder' or 'website'
  --subfolder                   Shortcut for --scope=subfolder
  --website                     Shortcut for --scope=website
  --name <name>                 Human-readable documentation source name
  --description, --desc <desc>  Summary description of the service or documentation
  --slug <slug>                 Custom source slug key (default: first URL path segment)
  --db <path>                   Path to SQLite database file (default: ./docs.db)
  --layout <nav|url>            nav (default): folders follow the site's sidebar tree, numbered in
                                sidebar order, plus _tree.json; url: folders follow URL paths
  --force, -f                   Force re-downloading previously visited pages
  --debug, -d, --verbose        Enable verbose step-by-step debug logging
  --help, -h                    Display this help message

ENVIRONMENT VARIABLES:
  DEBUG=1, DDOCS_DEBUG=1        Enable verbose debug logging across all steps
  KNOWLEDGE_ROOT=<path>         Root for default output (<path>/Documents/<slug>)
  HOST_ENV=remote               Routes default output to /srv/knowledge/documentation/<slug>/
  DATABASE_URL=<postgres-url>   Use Postgres instead of SQLite for the index

EXAMPLES:
  # Crawl subfolder documentation with 5 parallel workers:
  ddocs crawl https://docs.openclaw.ai/ ./output -c 5

  # Crawl with verbose debug mode enabled:
  ddocs crawl https://docs.openclaw.ai/ ./output --debug -c 5

  # Crawl with custom metadata and slug:
  ddocs crawl https://docs.openclaw.ai/ ./output --name "OpenClaw Docs" --slug "openclaw" -c 5

  # Remote environment execution:
  HOST_ENV=remote npm start -- https://tailscale.com/docs/ ./output -c 5
`);
}

if (require.main === module) {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help || !options.url) {
    printMainCliHelp();
    if (!options.help) {
      logger.error('CLI', 'Missing mandatory <url> positional argument.');
      process.exit(1);
    }
    process.exit(0);
  }

  if (options.debug) {
    setDebugMode(true);
  }

  console.log(`Starting crawl: ${options.url}`);
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Crawl scope: ${options.scope}`);
  console.log(`Concurrency: ${options.concurrency}`);
  if (options.debug) {
    console.log(`Debug mode: ENABLED`);
  }

  main(
    options.url,
    options.outputDir,
    options.scope,
    options.concurrency,
    options.dbPath,
    options.force,
    options.name,
    options.description,
    options.slug,
    options.debug,
    options.layout
  ).catch((err) => {
    logger.error('MAIN', `Fatal error during crawl execution: ${err.message}`, err);
    process.exit(1);
  });
}