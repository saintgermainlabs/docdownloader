import { readdirSync, readFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { VisitedDatabase, computeHash } from '../storage/database';

export interface ImportDocsOptions {
  dir: string;
  slug?: string;
  name?: string;
  url?: string;
  description?: string;
  dbPath?: string;
}

export function parseImportCliArgs(argv: string[]): ImportDocsOptions {
  let dir = '';
  let slug: string | undefined;
  let name: string | undefined;
  let url: string | undefined;
  let description: string | undefined;
  let dbPath = './docs.db';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' || arg === '-d') {
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

export function extractMarkdownTitle(content: string, fallbackFileName: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return basename(fallbackFileName, '.md');
}

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

if (require.main === module) {
  const options = parseImportCliArgs(process.argv.slice(2));
  try {
    importDocs(options);
  } catch (err: any) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
}
