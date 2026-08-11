import { readdirSync, readFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { VisitedDatabase, computeHash } from '../storage/database';

/**
 * Options for configuring document folder imports into SQLite.
 */
export interface ImportDocsOptions {
  /** Directory path containing local Markdown files */
  dir: string;
  /** Custom source slug key */
  slug?: string;
  /** Human-readable source name */
  name?: string;
  /** Base starting URL string */
  url?: string;
  /** Description of the documentation source */
  description?: string;
  /** SQLite database file path (default: `./docs.db`) */
  dbPath?: string;
}

/**
 * Parses CLI arguments for the `import-docs` utility command.
 *
 * @param argv - Command line argument strings.
 * @returns Parsed {@link ImportDocsOptions} object.
 */
export function parseImportCliArgs(argv: string[]): ImportDocsOptions {
  let dir = '';
  let slug: string | undefined;
  let name: string | undefined;
  let url: string | undefined;
  let description: string | undefined;
  let dbPath = './docs.db';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printImportDocsHelp();
      process.exit(0);
    } else if (arg === '--dir' || arg === '-d') {
      dir = argv[++i];
    } else if (arg.startsWith('--dir=')) {
      dir = arg.split('=')[1];
    } else if (arg === '--slug' || arg === '-s') {
      slug = argv[++i];
    } else if (arg.startsWith('--slug=')) {
      slug = arg.split('=')[1];
    } else if (arg === '--name' || arg === '-n') {
      name = argv[++i];
    } else if (arg.startsWith('--name=')) {
      name = arg.split('=')[1];
    } else if (arg === '--url' || arg === '-u') {
      url = argv[++i];
    } else if (arg.startsWith('--url=')) {
      url = arg.split('=')[1];
    } else if (arg === '--description' || arg === '--desc') {
      description = argv[++i];
    } else if (arg.startsWith('--description=') || arg.startsWith('--desc=')) {
      description = arg.split('=')[1];
    } else if (arg === '--db') {
      dbPath = argv[++i];
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.split('=')[1];
    }
  }

  return { dir, slug, name, url, description, dbPath };
}

/**
 * Recursively scans a local directory path to find all `.md` files.
 *
 * @param dirPath - Absolute or relative directory path.
 * @returns Array of full file path strings.
 */
export function findMarkdownFiles(dirPath: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Extracts H1 title from Markdown text or falls back to filename.
 *
 * @param content - Markdown string.
 * @param fallbackFileName - Default filename.
 * @returns Extracted title string.
 */
export function extractMarkdownTitle(content: string, fallbackFileName: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return basename(fallbackFileName, '.md');
}

/**
 * Imports an existing local Markdown folder into `./docs.db`.
 *
 * @param options - Import configuration options.
 * @throws {Error} Thrown if `--dir` path is not provided.
 * @returns Number of imported documents.
 */
export function importDocs(options: ImportDocsOptions): number {
  if (!options.dir) {
    throw new Error('Please provide a directory path using --dir <path>');
  }

  const baseDir = options.dir;
  const sourceSlug = options.slug || basename(baseDir) || 'imported';
  const sourceName = options.name || sourceSlug;
  const startUrl = options.url || `https://${sourceSlug}.local/`;
  const description = options.description || `${sourceName} Documentation`;
  const dbPath = options.dbPath || './docs.db';

  const db = new VisitedDatabase(dbPath);

  db.recordSource({
    slug: sourceSlug,
    name: sourceName,
    startUrl,
    description
  });

  const files = findMarkdownFiles(baseDir);
  let importedCount = 0;

  for (const filePath of files) {
    const relativeFilePath = relative(process.cwd(), filePath);
    const content = readFileSync(filePath, 'utf-8');
    const title = extractMarkdownTitle(content, filePath);
    const contentHash = computeHash(content);

    const fileSubPath = relative(baseDir, filePath).replace(/\.md$/, '');
    let docUrl = `https://${sourceSlug}.local/${fileSubPath}`;
    if (options.url) {
      try {
        const baseUrl = options.url.endsWith('/') ? options.url : options.url + '/';
        docUrl = new URL(fileSubPath === 'index' ? '' : fileSubPath, baseUrl).href;
      } catch {
        docUrl = `https://${sourceSlug}.local/${fileSubPath}`;
      }
    }

    db.recordVisited({
      url: docUrl,
      sourceSlug,
      relativeFilePath,
      title,
      contentHash
    });

    importedCount++;
  }

  db.close();
  console.log(`Imported ${importedCount} document(s) for source "${sourceSlug}" into ${dbPath}`);
  return importedCount;
}

/**
 * Prints help information for the `import-docs` CLI command.
 */
export function printImportDocsHelp(): void {
  console.log(`
import-docs CLI - Import Existing Documentation Folder into SQLite Database

USAGE:
  npm run import-docs -- --dir=<path> [options]
  node dist/src/scripts/importDocs.js --dir=<path> [options]

REQUIRED:
  --dir=<path>, -d <path>     Directory path containing pre-downloaded Markdown files

OPTIONS:
  --slug=<slug>, -s <slug>    Custom source slug (defaults to folder basename)
  --name=<name>, -n <name>    Human-readable source name
  --url=<url>, -u <url>       Starting origin URL for doc URL generation
  --description=<desc>        Summary description of the imported documentation
  --db=<path>                 SQLite database file path (default: ./docs.db)
  --help, -h                  Display this help message

EXAMPLES:
  # Import existing coolify documentation:
  npm run import-docs -- --dir=output/coolify --slug=coolify --name="Coolify Docs"
`);
}

if (require.main === module) {
  const options = parseImportCliArgs(process.argv.slice(2));
  if (!options.dir) {
    printImportDocsHelp();
    process.exit(1);
  }
  try {
    importDocs(options);
  } catch (err: any) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
}
