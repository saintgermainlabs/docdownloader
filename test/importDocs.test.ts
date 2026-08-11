import assert from 'node:assert';
import { test, describe, after } from 'node:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseImportCliArgs, extractMarkdownTitle, importDocs } from '../src/scripts/importDocs';
import { VisitedDatabase } from '../src/storage/database';

describe('importDocs', () => {
  const testDir = join(__dirname, 'mock_docs');
  const dbPath = join(__dirname, 'test_unified_import.db');

  after(() => {
    if (existsSync(testDir)) {
      try { rmSync(testDir, { recursive: true, force: true }); } catch {}
    }
    if (existsSync(dbPath)) {
      try { rmSync(dbPath, { force: true }); } catch {}
    }
  });

  test('parses import CLI flags', () => {
    const opts = parseImportCliArgs(['--dir', './output/coolify', '--slug', 'coolify', '--name', 'Coolify', '--url', 'https://coolify.io/docs', '--description', 'Self-hosted PaaS']);
    assert.strictEqual(opts.dir, './output/coolify');
    assert.strictEqual(opts.slug, 'coolify');
    assert.strictEqual(opts.name, 'Coolify');
    assert.strictEqual(opts.url, 'https://coolify.io/docs');
    assert.strictEqual(opts.description, 'Self-hosted PaaS');
  });

  test('extracts title from Markdown H1 header', () => {
    const title = extractMarkdownTitle('# Welcome to Coolify Docs\nSome content...', 'index.md');
    assert.strictEqual(title, 'Welcome to Coolify Docs');
  });

  test('imports mock documentation folder into unified SQLite DB', () => {
    mkdirSync(join(testDir, 'sub'), { recursive: true });
    writeFileSync(join(testDir, 'index.md'), '# Coolify Overview\nOverview text');
    writeFileSync(join(testDir, 'sub', 'services.md'), '# Services Guide\nServices text');

    const count = importDocs({
      dir: testDir,
      slug: 'coolify',
      name: 'Coolify Platform',
      url: 'https://coolify.io/docs',
      description: 'An open-source & self-hosted Heroku / Netlify alternative',
      dbPath
    });

    assert.strictEqual(count, 2);

    const db = new VisitedDatabase(dbPath);
    const source = db.getSource('coolify');
    assert.ok(source);
    assert.strictEqual(source?.name, 'Coolify Platform');

    const records = db.getAllVisited('coolify');
    assert.strictEqual(records.length, 2);

    const titles = records.map((r) => r.title);
    assert.ok(titles.includes('Coolify Overview'));
    assert.ok(titles.includes('Services Guide'));

    db.close();
  });
});
