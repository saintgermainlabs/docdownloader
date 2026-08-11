import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface SourceRecord {
  slug: string;
  name: string;
  startUrl: string;
  description?: string;
  createdAt?: string;
}

export interface VisitedRecord {
  url: string;
  sourceSlug: string;
  relativeFilePath: string;
  title?: string;
  downloadedAt?: string;
  contentHash?: string;
}

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

export class VisitedDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
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

  recordSource(record: SourceRecord) {
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

  getSource(slug: string): SourceRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT slug, name, start_url as startUrl, description, created_at as createdAt
      FROM sources
      WHERE slug = ?
    `);
    return stmt.get(slug) as SourceRecord | undefined;
  }

  getAllSources(): SourceRecord[] {
    const stmt = this.db.prepare(`
      SELECT slug, name, start_url as startUrl, description, created_at as createdAt
      FROM sources
      ORDER BY created_at ASC
    `);
    return stmt.all() as SourceRecord[];
  }

  hasVisited(url: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM visited_urls WHERE url = ?');
    return !!stmt.get(url);
  }

  getRecord(url: string): VisitedRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT url, source_slug as sourceSlug, relative_file_path as relativeFilePath, title, downloaded_at as downloadedAt, content_hash as contentHash
      FROM visited_urls
      WHERE url = ?
    `);
    return stmt.get(url) as VisitedRecord | undefined;
  }

  recordVisited(record: VisitedRecord) {
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

  close() {
    this.db.close();
  }
}

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
