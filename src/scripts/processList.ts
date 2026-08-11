import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { parse } from 'yaml';
import { main } from '../index';
import { extractDefaultSlug, VisitedDatabase } from '../storage/database';
import { CrawlScope } from '../crawler/urlUtils';
import { resolveOutputDir } from '../storage/paths';

/**
 * Options configuration for a single item in a batch pending list file.
 */
export interface PendingItemOptions {
  /** Target documentation URL to crawl */
  url: string;
  /** Optional custom output directory override */
  outputDir?: string;
  /** Crawl scope constraint (`'subfolder'` or `'website'`) */
  scope?: CrawlScope;
  /** Concurrency worker count (default: 5) */
  concurrency?: number;
  /** SQLite database path (default: `./docs.db`) */
  dbPath?: string;
  /** Force re-downloading visited pages */
  force?: boolean;
  /** Human-readable source name */
  name?: string;
  /** Description of the documentation source */
  description?: string;
  /** Custom source slug */
  slug?: string;
}

/**
 * Wrapper structure for pending list files.
 */
export interface PendingList {
  /** Array of string URLs or detailed {@link PendingItemOptions} objects */
  urls: Array<string | PendingItemOptions>;
}

/**
 * Parses a YAML or JSON pending list file and returns an array of normalized {@link PendingItemOptions}.
 *
 * @param filePath - Path to YAML or JSON pending list file.
 * @throws {Error} Thrown if file does not exist.
 * @returns Array of {@link PendingItemOptions} objects.
 */
export function parsePendingFile(filePath: string): PendingItemOptions[] {
  if (!existsSync(filePath)) {
    throw new Error(`Pending file not found: ${filePath}`);
  }

  const rawContent = readFileSync(filePath, 'utf-8');
  let parsed: any;

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    parsed = parse(rawContent);
  } else {
    parsed = JSON.parse(rawContent);
  }

  const rawList: Array<string | PendingItemOptions> = Array.isArray(parsed)
    ? parsed
    : parsed?.urls || [];

  return rawList.map((item) => {
    if (typeof item === 'string') {
      return { url: item };
    }
    return item;
  });
}

/**
 * Converts a YAML pending list file (`data/pending.yaml`) to JSON (`data/pending.json`).
 *
 * @param yamlPath - Path to input YAML file.
 * @param jsonPath - Path to output JSON file.
 * @returns Array of parsed {@link PendingItemOptions}.
 */
export function convertYamlToJson(yamlPath: string, jsonPath: string): PendingItemOptions[] {
  const items = parsePendingFile(yamlPath);
  writeFileSync(jsonPath, JSON.stringify({ urls: items }, null, 2), 'utf-8');
  console.log(`Converted ${yamlPath} -> ${jsonPath}`);
  return items;
}

/**
 * Main batch executor for crawling all pending documentation URLs sequentially into `./docs.db`.
 *
 * @param customFilePath - Optional custom path to a YAML or JSON pending list file.
 */
export async function processList(customFilePath?: string): Promise<void> {
  const yamlPath = join(process.cwd(), 'data', 'pending.yaml');
  const jsonPath = join(process.cwd(), 'data', 'pending.json');
  const targetFile = customFilePath || (existsSync(yamlPath) ? yamlPath : jsonPath);

  if (!existsSync(targetFile)) {
    throw new Error(`No pending file found at ${yamlPath} or ${jsonPath}`);
  }

  if (targetFile.endsWith('.yaml') || targetFile.endsWith('.yml')) {
    convertYamlToJson(targetFile, jsonPath);
  }

  const items = parsePendingFile(targetFile);

  console.log(`Found ${items.length} pending documentation URL(s) to process.\n`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = item.url;
    const slug = item.slug || extractDefaultSlug(url);
    const outputDir = resolveOutputDir(slug, 'repo', 'awesome', item.outputDir);
    const scope = item.scope || 'subfolder';
    const concurrency = item.concurrency || 5;
    const dbPath = item.dbPath || './docs.db';
    const force = item.force || false;
    const name = item.name || slug;
    const description = item.description || `${name} Documentation`;

    console.log(`--------------------------------------------------`);
    console.log(`Processing [${i + 1}/${items.length}]: ${url}`);
    console.log(` - Output Dir: ${outputDir}`);
    console.log(` - Scope: ${scope}`);
    console.log(` - Concurrency: ${concurrency}`);
    console.log(` - Slug: ${slug}`);
    console.log(`--------------------------------------------------`);

    try {
      await main(
        url,
        outputDir,
        scope,
        concurrency,
        dbPath,
        force,
        name,
        description,
        slug
      );
      console.log(`Finished processing: ${url}\n`);
    } catch (error) {
      console.error(`Failed to process ${url}:`, error);
    }
  }

  console.log('All pending items processed.');
}

/**
 * Prints help information for the `process-list` CLI command.
 */
export function printProcessListHelp(): void {
  console.log(`
process-list CLI - Batch Documentation Processing Tool

USAGE:
  npm run process-list [-- [options]]
  node dist/src/scripts/processList.js [options]

OPTIONS:
  --file=<path>, -f <path>    Specify custom YAML or JSON pending list file
                              (default: data/pending.yaml or data/pending.json)
  --help, -h                  Display this help message

ENVIRONMENT VARIABLES:
  HOST_ENV=remote             Routes outputs to /srv/knowledge/documents/<slug>/

EXAMPLES:
  # Process default data/pending.yaml list:
  npm run process-list

  # Process custom list file:
  npm run process-list -- --file=data/my_list.yaml

  # Execute in remote environment:
  HOST_ENV=remote npm run process-list
`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let customFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      printProcessListHelp();
      process.exit(0);
    } else if (args[i] === '--file' || args[i] === '-f') {
      customFile = args[++i];
    } else if (args[i].startsWith('--file=')) {
      customFile = args[i].split('=')[1];
    }
  }

  processList(customFile).catch((err) => {
    console.error('Batch processing failed:', err.message);
    process.exit(1);
  });
}
