import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Represents a documentation source service or website recorded in SQLite.
 */
export interface SourceRecord {
  /** Unique primary key slug (e.g. `openclaw`, `coolify`, `web-audio-api`) */
  slug: string;
  /** Human-readable display name */
  name: string;
  /** Initial starting URL of the crawl */
  startUrl: string;
  /** Description of the documentation service */
  description?: string;
  /** ISO 8601 registration timestamp */
  createdAt?: string;
}

/**
 * Represents a visited webpage or Markdown document recorded in SQLite.
 */
export interface VisitedRecord {
  /** Primary key URL of the webpage or raw file */
  url: string;
  /** Foreign key referencing {@link SourceRecord.slug} */
  sourceSlug: string;
  /** Relative file path where the Markdown file is stored on disk */
  relativeFilePath: string;
  /** Extracted page or document title */
  title?: string;
  /** ISO 8601 download timestamp */
  downloadedAt?: string;
  /** SHA-256 hash of the downloaded Markdown content */
  contentHash?: string;
}

const GENERIC_SLUG_PREFIXES = new Set([
  'docs',
  'documentation',
  'doc',
  'guide',
  'guides',
  'manual',
  'api',
  'reference',
  'en',
  'zh',
  'zh-hans',
  'v1',
  'v2',
  'v3',
  'latest',
  'stable',
]);

/**
 * Extracts an intelligent default source slug from a starting URL.
 *
 * @param startUrl - The URL to extract from (e.g. `https://example.com/docs/v2` or `https://hermes-agent.nousresearch.com/docs/`).
 * @returns Non-generic path segment, subdomain, or hostname.
 *
 * @example
 * ```typescript
 * extractDefaultSlug('https://www.quartz-scheduler.org/documentation/quartz-2.5.x/');
 * // Returns 'quartz-2.5.x'
 *
 * extractDefaultSlug('https://hermes-agent.nousresearch.com/docs/');
 * // Returns 'hermes-agent'
 * ```
 */
export function extractDefaultSlug(startUrl: string): string {
  try {
    const url = new URL(startUrl);
    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);

    // Filter out generic path segments like 'documentation', 'docs', 'reference', etc.
    const meaningfulParts = parts.filter(
      (p) => !GENERIC_SLUG_PREFIXES.has(p.toLowerCase())
    );
    if (meaningfulParts.length > 0) {
      return meaningfulParts[0];
    }

    // Check if subdomain is specific (e.g. 'hermes-agent' in hermes-agent.nousresearch.com)
    const hostParts = host.split('.');
    if (hostParts.length > 2 && !GENERIC_SLUG_PREFIXES.has(hostParts[0].toLowerCase())) {
      return hostParts[0];
    }

    // If host starts with 'docs.' (e.g. docs.openclaw.ai), keep full hostname
    if (hostParts[0] === 'docs' && hostParts.length >= 2) {
      return host;
    }

    // Otherwise return first host part or full host
    if (hostParts.length >= 2) {
      return hostParts[0];
    }

    return host || 'default';
  } catch {
    return 'default';
  }
}

const SRC_COLS = 'slug, name, start_url as "startUrl", description, created_at as "createdAt"';
const VIS_COLS =
  'url, source_slug as "sourceSlug", relative_file_path as "relativeFilePath", title, downloaded_at as "downloadedAt", content_hash as "contentHash"';

function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return v instanceof Date ? v.toISOString() : String(v);
}

function normSource(r: any): SourceRecord | undefined {
  return r ? { ...r, createdAt: toIso(r.createdAt) } : undefined;
}

function normVisited(r: any): VisitedRecord | undefined {
  return r ? { ...r, downloadedAt: toIso(r.downloadedAt) } : undefined;
}

/**
 * Dual-mode database wrapper for documentation sources and visited URLs.
 *
 * @remarks
 * If `process.env.DATABASE_URL` is set, uses Postgres (Neon) via a `pg` Pool;
 * otherwise uses a local SQLite file via `better-sqlite3`. All methods are async.
 */
export class VisitedDatabase {
  private db?: Database.Database;
  private pool?: Pool;
  private ready: Promise<void>;

  /** True when backed by Postgres (DATABASE_URL set). */
  readonly isPostgres: boolean;

  /**
   * @param dbPath - SQLite file path (ignored when DATABASE_URL is set).
   * @param databaseUrl - Optional Postgres URL override (defaults to `process.env.DATABASE_URL`).
   */
  constructor(dbPath: string, databaseUrl: string | undefined = process.env.DATABASE_URL) {
    if (databaseUrl) {
      this.isPostgres = true;
      this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
      this.ready = this.initPg();
      this.ready.catch(() => {});
    } else {
      this.isPostgres = false;
      mkdirSync(dirname(dbPath), { recursive: true });
      this.db = new Database(dbPath);
      this.initSqlite();
      this.ready = Promise.resolve();
    }
  }

  private initSqlite(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_url TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS visited_urls (
        url TEXT PRIMARY KEY,
        source_slug TEXT NOT NULL,
        relative_file_path TEXT NOT NULL,
        title TEXT,
        downloaded_at TEXT NOT NULL,
        content_hash TEXT,
        FOREIGN KEY (source_slug) REFERENCES sources(slug)
      );
    `);
  }

  private async initPg(): Promise<void> {
    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS sources (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_url TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS visited_urls (
        url TEXT PRIMARY KEY,
        source_slug TEXT NOT NULL REFERENCES sources(slug),
        relative_file_path TEXT NOT NULL,
        title TEXT,
        downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        content_hash TEXT
      );
    `);
  }

  private async pg<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.ready;
    const res = await this.pool!.query(sql, params);
    return res.rows as T[];
  }

  /** Records or updates a documentation source entry. */
  async recordSource(record: SourceRecord): Promise<void> {
    const createdAt = record.createdAt || new Date().toISOString();
    const params = [record.slug, record.name, record.startUrl, record.description || '', createdAt];
    if (this.pool) {
      await this.pg(
        `INSERT INTO sources (slug, name, start_url, description, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, start_url = EXCLUDED.start_url,
           description = EXCLUDED.description, created_at = EXCLUDED.created_at`,
        params
      );
      return;
    }
    this.db!.prepare(
      `INSERT OR REPLACE INTO sources (slug, name, start_url, description, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(...params);
  }

  /** Retrieves a single source record by its slug. */
  async getSource(slug: string): Promise<SourceRecord | undefined> {
    if (this.pool) {
      return normSource((await this.pg(`SELECT ${SRC_COLS} FROM sources WHERE slug = $1`, [slug]))[0]);
    }
    return this.db!.prepare(`SELECT ${SRC_COLS} FROM sources WHERE slug = ?`).get(slug) as SourceRecord | undefined;
  }

  /** Returns all recorded documentation sources ordered by creation date. */
  async getAllSources(): Promise<SourceRecord[]> {
    const sql = `SELECT ${SRC_COLS} FROM sources ORDER BY created_at ASC`;
    if (this.pool) return (await this.pg(sql)).map((r) => normSource(r)!);
    return this.db!.prepare(sql).all() as SourceRecord[];
  }

  /** Checks whether a URL has already been recorded in `visited_urls`. */
  async hasVisited(url: string): Promise<boolean> {
    if (this.pool) return (await this.pg('SELECT 1 FROM visited_urls WHERE url = $1', [url])).length > 0;
    return !!this.db!.prepare('SELECT 1 FROM visited_urls WHERE url = ?').get(url);
  }

  /** Retrieves the visited record for a given URL. */
  async getRecord(url: string): Promise<VisitedRecord | undefined> {
    if (this.pool) {
      return normVisited((await this.pg(`SELECT ${VIS_COLS} FROM visited_urls WHERE url = $1`, [url]))[0]);
    }
    return this.db!.prepare(`SELECT ${VIS_COLS} FROM visited_urls WHERE url = ?`).get(url) as VisitedRecord | undefined;
  }

  /** Records or updates a visited URL entry. */
  async recordVisited(record: VisitedRecord): Promise<void> {
    const downloadedAt = record.downloadedAt || new Date().toISOString();
    const params = [
      record.url,
      record.sourceSlug,
      record.relativeFilePath,
      record.title || '',
      downloadedAt,
      record.contentHash || '',
    ];
    if (this.pool) {
      await this.pg(
        `INSERT INTO visited_urls (url, source_slug, relative_file_path, title, downloaded_at, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (url) DO UPDATE SET source_slug = EXCLUDED.source_slug,
           relative_file_path = EXCLUDED.relative_file_path, title = EXCLUDED.title,
           downloaded_at = EXCLUDED.downloaded_at, content_hash = EXCLUDED.content_hash`,
        params
      );
      return;
    }
    this.db!.prepare(
      `INSERT OR REPLACE INTO visited_urls (url, source_slug, relative_file_path, title, downloaded_at, content_hash) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(...params);
  }

  /** Retrieves all visited URL records, optionally filtered by `sourceSlug`. */
  async getAllVisited(sourceSlug?: string): Promise<VisitedRecord[]> {
    if (this.pool) {
      const rows = sourceSlug
        ? await this.pg(`SELECT ${VIS_COLS} FROM visited_urls WHERE source_slug = $1 ORDER BY downloaded_at ASC`, [sourceSlug])
        : await this.pg(`SELECT ${VIS_COLS} FROM visited_urls ORDER BY downloaded_at ASC`);
      return rows.map((r) => normVisited(r)!);
    }
    if (sourceSlug) {
      return this.db!.prepare(
        `SELECT ${VIS_COLS} FROM visited_urls WHERE source_slug = ? ORDER BY downloaded_at ASC`
      ).all(sourceSlug) as VisitedRecord[];
    }
    return this.db!.prepare(`SELECT ${VIS_COLS} FROM visited_urls ORDER BY downloaded_at ASC`).all() as VisitedRecord[];
  }

  /** Closes the SQLite connection or ends the Postgres pool. */
  async close(): Promise<void> {
    if (this.pool) {
      await this.ready.catch(() => {});
      await this.pool.end();
      return;
    }
    this.db!.close();
  }
}

/**
 * Computes a SHA-256 hexadecimal hash string for string content.
 *
 * @param content - String content to hash.
 * @returns SHA-256 hex string.
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
