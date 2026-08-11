import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { parse } from 'yaml';
import { main } from '../index';
import { extractDefaultSlug, VisitedDatabase } from '../storage/database';
import { CrawlScope } from '../crawler/urlUtils';

export interface PendingItemOptions {
  url: string;
  outputDir?: string;
  scope?: CrawlScope;
  concurrency?: number;
  dbPath?: string;
  force?: boolean;
  name?: string;
  description?: string;
  slug?: string;
}

export interface PendingList {
  urls: Array<string | PendingItemOptions>;
}

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

export function convertYamlToJson(yamlPath: string, jsonPath: string): PendingItemOptions[] {
  const items = parsePendingFile(yamlPath);
  writeFileSync(jsonPath, JSON.stringify({ urls: items }, null, 2), 'utf-8');
  console.log(`Converted ${yamlPath} -> ${jsonPath}`);
  return items;
}

export async function processList(customFilePath?: string) {
  const yamlPath = join(process.cwd(), 'data', 'pending.yaml');
  const jsonPath = join(process.cwd(), 'data', 'pending.json');
  const targetFile = customFilePath || (existsSync(yamlPath) ? yamlPath : jsonPath);

  if (!existsSync(targetFile)) {
    throw new Error(`No pending file found at ${yamlPath} or ${jsonPath}`);
  }

  // Convert YAML to JSON if reading YAML
  if (targetFile.endsWith('.yaml') || targetFile.endsWith('.yml')) {
    convertYamlToJson(targetFile, jsonPath);
  }

  const items = parsePendingFile(targetFile);

  console.log(`Found ${items.length} pending documentation URL(s) to process.\n`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = item.url;
    const slug = item.slug || extractDefaultSlug(url);
    const outputDir = item.outputDir || join('./output', slug);
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

if (require.main === module) {
  const args = process.argv.slice(2);
  let customFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') {
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
