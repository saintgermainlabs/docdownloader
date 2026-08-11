import Database from 'better-sqlite3';
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

/**
 * Extracts a default source slug from a starting URL.
 *
 * @param startUrl - The URL to extract from (e.g. `https://example.com/docs/v2`).
 * @returns The first path segment (e.g. `docs`) or hostname if at origin root.
 *
 * @example
 * ```typescript
 * extractDefaultSlug('https://developer.mozilla.org/en-US/docs/Web/API');
 * // Returns 'en-US'
 * ```
 */
export function extractDefaultSlug(startUrl: string): string {
  try {
    const url = new URL(startUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'default';
  }
}

/**
 * SQLite database wrapper for recording and querying documentation sources and visited URLs.
 *
 * @remarks
 * Uses `better-sqlite3` for fast synchronous SQLite queries and transactions.
 */
export class VisitedDatabase {
  private db: Database.Database;

  /**
   * Initializes or connects to a SQLite database file at `dbPath`.
   *
   * @param dbPath - Absolute or relative path to SQLite database file.
   */
  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
  }

  /**
   * Ensures `sources` and `visited_urls` tables exist with primary and foreign keys.
   */
  private init(): void {
    this.db.exec(`
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

  /**
   * Records or updates a documentation source entry.
   *
   * @param record - Source metadata object.
   */
  recordSource(record: SourceRecord): void {
    const createdAt = record.createdAt || new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sources (slug, name, start_url, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.slug,
      record.name,
      record.startUrl,
      record.description || '',
      createdAt
    );
  }

  /**
   * Retrieves a single source record by its slug.
   *
   * @param slug - Source slug key.
   * @returns The matching {@link SourceRecord} or undefined.
   */
  getSource(slug: string): SourceRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT slug, name, start_url as startUrl, description, created_at as createdAt
      FROM sources
      WHERE slug = ?
    `);
    return stmt.get(slug) as SourceRecord | undefined;
  }

  /**
   * Returns all recorded documentation sources ordered by creation date.
   *
   * @returns Array of {@link SourceRecord} objects.
   */
  getAllSources(): SourceRecord[] {
    const stmt = this.db.prepare(`
      SELECT slug, name, start_url as startUrl, description, created_at as createdAt
      FROM sources
      ORDER BY created_at ASC
    `);
    return stmt.all() as SourceRecord[];
  }

  /**
   * Checks whether a URL has already been recorded in `visited_urls`.
   *
   * @param url - Absolute URL string.
   * @returns True if already visited, false otherwise.
   */
  hasVisited(url: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM visited_urls WHERE url = ?');
    return !!stmt.get(url);
  }

  /**
   * Retrieves the visited record for a given URL.
   *
   * @param url - Absolute URL string.
   * @returns The matching {@link VisitedRecord} or undefined.
   */
  getRecord(url: string): VisitedRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT url, source_slug as sourceSlug, relative_file_path as relativeFilePath, title, downloaded_at as downloadedAt, content_hash as contentHash
      FROM visited_urls
      WHERE url = ?
    `);
    return stmt.get(url) as VisitedRecord | undefined;
  }

  /**
   * Records or updates a visited URL entry.
   *
   * @param record - Visited page metadata object.
   */
  recordVisited(record: VisitedRecord): void {
    const downloadedAt = record.downloadedAt || new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO visited_urls (url, source_slug, relative_file_path, title, downloaded_at, content_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.url,
      record.sourceSlug,
      record.relativeFilePath,
      record.title || '',
      downloadedAt,
      record.contentHash || ''
    );
  }

  /**
   * Retrieves all visited URL records, optionally filtered by `sourceSlug`.
   *
   * @param sourceSlug - Optional filter by source slug.
   * @returns Array of {@link VisitedRecord} objects.
   */
  getAllVisited(sourceSlug?: string): VisitedRecord[] {
    if (sourceSlug) {
      const stmt = this.db.prepare(`
        SELECT url, source_slug as sourceSlug, relative_file_path as relativeFilePath, title, downloaded_at as downloadedAt, content_hash as contentHash
        FROM visited_urls
        WHERE source_slug = ?
        ORDER BY downloaded_at ASC
      `);
      return stmt.all(sourceSlug) as VisitedRecord[];
    }
    const stmt = this.db.prepare(`
      SELECT url, source_slug as sourceSlug, relative_file_path as relativeFilePath, title, downloaded_at as downloadedAt, content_hash as contentHash
      FROM visited_urls
      ORDER BY downloaded_at ASC
    `);
    return stmt.all() as VisitedRecord[];
  }

  /**
   * Closes the SQLite database connection.
   */
  close(): void {
    this.db.close();
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
