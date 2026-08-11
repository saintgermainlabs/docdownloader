import { join } from 'path';
import { BrowserManager } from './crawler/browser';
import { CrawlerQueue } from './crawler/queue';
import { normalizeUrl, isUrlInScope, CrawlScope } from './crawler/urlUtils';
import { MarkdownConverter } from './converter/markdown';
import { FileStorage } from './storage/fileSystem';
import { VisitedDatabase, computeHash, extractDefaultSlug } from './storage/database';
import { resolveOutputDir } from './storage/paths';

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
}

/**
 * Parses command-line arguments for the primary crawler CLI.
 *
 * @param argv - Array of command-line argument strings.
 * @returns Parsed {@link CliOptions} object.
 */
export function parseCliArgs(argv: string[]): CliOptions {
  let url = '';
  let outputDir = './output';
  let scope: CrawlScope = 'subfolder';
  let concurrency = 1;
  let dbPath: string | undefined;
  let force = false;
  let name: string | undefined;
  let description: string | undefined;
  let slug: string | undefined;
  let help = false;

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-f' || arg === '--force') {
      force = true;
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

  if (positionals.length > 0) {
    url = positionals[0];
  }
  if (positionals.length > 1) {
    const second = positionals[1].toLowerCase();
    if (second === 'subfolder' || second === 'website' || second === 'site' || second === 'all' || second === 'sub') {
      scope = second === 'website' || second === 'site' || second === 'all' ? 'website' : 'subfolder';
    } else {
      outputDir = positionals[1];
    }
  }
  if (positionals.length > 2) {
    const third = positionals[2].toLowerCase();
    if (third === 'subfolder' || third === 'website' || third === 'site' || third === 'all' || third === 'sub') {
      scope = third === 'website' || third === 'site' || third === 'all' ? 'website' : 'subfolder';
    } else if (outputDir === './output') {
      outputDir = positionals[2];
    }
  }

  return { url, outputDir, scope, concurrency, dbPath, force, name, description, slug, help };
}

/**
 * Main application entrypoint for executing web documentation crawls.
 *
 * @param startUrl - Initial URL to start crawling from.
 * @param outputDir - Destination directory path (default: `./output`).
 * @param scope - Crawl scope constraint (`'subfolder'` or `'website'`).
 * @param concurrency - Number of parallel Playwright browser workers.
 * @param dbPath - SQLite database tracking path (default: `./docs.db`).
 * @param force - Force re-downloading previously recorded URLs.
 * @param name - Human-readable documentation source name.
 * @param description - Summary description of the documentation source.
 * @param slug - Source slug key.
 */
export async function main(
  startUrl: string,
  outputDir: string = './output',
  scope: CrawlScope = 'subfolder',
  concurrency: number = 1,
  dbPath?: string,
  force: boolean = false,
  name?: string,
  description?: string,
  slug?: string
): Promise<void> {
  const finalDbPath = dbPath || './docs.db';
  const db = new VisitedDatabase(finalDbPath);

  const sourceSlug = slug || extractDefaultSlug(startUrl);
  const sourceName = name || new URL(startUrl).hostname;
  const sourceDesc = description || '';
  const finalOutputDir = resolveOutputDir(sourceSlug, 'repo', 'awesome', outputDir);

  db.recordSource({
    slug: sourceSlug,
    name: sourceName,
    startUrl,
    description: sourceDesc
  });

  const browser = new BrowserManager();
  const queue = new CrawlerQueue({ db, force });
  const converter = new MarkdownConverter();
  const storage = new FileStorage(finalOutputDir);

  await browser.init();
  const initialUrl = normalizeUrl(startUrl, startUrl) || startUrl;
  queue.add(initialUrl);

  let activeWorkers = 0;

  try {
    async function worker() {
      while (true) {
        const url = queue.next();
        if (!url) {
          if (activeWorkers === 0) {
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
          if (queue.isEmpty() && activeWorkers === 0) {
            break;
          }
          continue;
        }

        activeWorkers++;
        const isVisited = !force && db.hasVisited(url);
        if (isVisited) {
          console.log(`Skipping download (already in database): ${url}`);
        } else {
          console.log(`Processing [active: ${activeWorkers}]: ${url}`);
        }

        const page = await browser.newPage();

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

          if (!isVisited) {
            const content = await page.content();
            const pageTitle = (await page.title()) || '';
            const markdown = converter.convert(content);

            const saved = await storage.saveMarkdown(new URL(url), markdown);
            const hash = computeHash(markdown);

            db.recordVisited({
              url,
              sourceSlug,
              relativeFilePath: saved.relativeFilePath,
              title: pageTitle,
              contentHash: hash
            });
          }

          const links = await page.$$eval('a', (as) => as.map((a) => a.href));
          for (const link of links) {
            const normalized = normalizeUrl(url, link);
            if (normalized && isUrlInScope(normalized, startUrl, scope)) {
              queue.add(normalized);
            }
          }
        } catch (error) {
          console.error(`Error processing ${url}:`, error);
        } finally {
          await page.close();
          activeWorkers--;
        }
      }
    }

    const workerCount = Math.max(1, concurrency);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
  } finally {
    await browser.close();
    db.close();
  }
}

/**
 * Prints comprehensive help information for the primary crawler CLI.
 */
export function printMainCliHelp(): void {
  console.log(`
ai-doc-downloader - TypeScript Web Documentation Harvester

USAGE:
  npm start -- <url> [outputDir] [scope] [options]
  node dist/src/index.js <url> [outputDir] [scope] [options]

ARGUMENTS:
  <url>                         Base seed URL to crawl (e.g. https://docs.openclaw.ai/)
  [outputDir]                   Directory to save Markdown files (default: ./output)
  [scope]                       Crawl scope: 'subfolder' or 'website' (default: subfolder)

OPTIONS:
  --concurrency, -c <N>         Number of parallel Playwright workers (default: 1)
  --scope, -s, --mode, -m <M>   Set scope: 'subfolder' or 'website'
  --subfolder                   Shortcut for --scope=subfolder
  --website                     Shortcut for --scope=website
  --name <name>                 Human-readable documentation source name
  --description, --desc <desc>  Summary description of the service or documentation
  --slug <slug>                 Custom source slug key (default: first URL path segment)
  --db <path>                   Path to SQLite database file (default: ./docs.db)
  --force, -f                   Force re-downloading previously visited pages
  --help, -h                    Display this help message

ENVIRONMENT VARIABLES:
  HOST_ENV=remote               Routes output directory to /srv/knowledge/documents/<slug>/

EXAMPLES:
  # Crawl subfolder documentation with 5 parallel workers:
  npm start -- https://docs.openclaw.ai/ -c 5

  # Crawl with custom metadata and slug:
  npm start -- https://docs.openclaw.ai/ --name "OpenClaw Docs" --slug "openclaw" -c 5

  # Remote environment execution:
  HOST_ENV=remote npm start -- https://tailscale.com/docs/ -c 5
`);
}

if (require.main === module) {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help || !options.url) {
    printMainCliHelp();
    if (!options.url && !options.help) {
      process.exit(1);
    }
    process.exit(0);
  }

  console.log(`Starting crawl: ${options.url}`);
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Crawl scope: ${options.scope}`);
  console.log(`Concurrency: ${options.concurrency}`);

  main(
    options.url,
    options.outputDir,
    options.scope,
    options.concurrency,
    options.dbPath,
    options.force,
    options.name,
    options.description,
    options.slug
  ).catch(console.error);
}