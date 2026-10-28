import assert from 'node:assert';
import { test, describe, after } from 'node:test';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { VisitedDatabase, computeHash, extractDefaultSlug } from '../src/storage/database';

describe('extractDefaultSlug', () => {
  test('extracts meaningful non-generic path segment as slug', async () => {
    assert.strictEqual(extractDefaultSlug('https://www.quartz-scheduler.org/documentation/quartz-2.5.x/'), 'quartz-2.5.x');
    assert.strictEqual(extractDefaultSlug('https://react.dev/reference/react'), 'react');
  });

  test('falls back to hostname or subdomain for root/generic paths', async () => {
    assert.strictEqual(extractDefaultSlug('https://www.example.com/'), 'example');
    assert.strictEqual(extractDefaultSlug('https://hermes-agent.nousresearch.com/docs/'), 'hermes-agent');
  });
});

describe('VisitedDatabase', () => {
  const dbPath = join(__dirname, 'test_crawler_history.db');

  after(() => {
    if (existsSync(dbPath)) {
      try { unlinkSync(dbPath); } catch {}
    }
  });

  test('records source and visited pages with sourceSlug', async () => {
    const db = new VisitedDatabase(dbPath);

    await db.recordSource({
      slug: 'quartz',
      name: 'Quartz Scheduler',
      startUrl: 'https://www.quartz-scheduler.org/documentation/quartz-2.5.x/',
      description: 'Enterprise Job Scheduler for Java'
    });

    const source = await db.getSource('quartz');
    assert.ok(source);
    assert.strictEqual(source?.name, 'Quartz Scheduler');
    assert.strictEqual(source?.startUrl, 'https://www.quartz-scheduler.org/documentation/quartz-2.5.x/');

    const record = {
      url: 'https://example.com/docs/page1',
      sourceSlug: 'quartz',
      relativeFilePath: 'docs/page1.md',
      title: 'Page 1 Title',
      contentHash: computeHash('# Page 1 Content')
    };

    await db.recordVisited(record);

    assert.strictEqual(await db.hasVisited('https://example.com/docs/page1'), true);

    const fetched = await db.getRecord('https://example.com/docs/page1');
    assert.ok(fetched);
    assert.strictEqual(fetched?.sourceSlug, 'quartz');
    assert.strictEqual(fetched?.relativeFilePath, record.relativeFilePath);

    const allForSource = await db.getAllVisited('quartz');
    assert.strictEqual(allForSource.length, 1);
    assert.strictEqual(allForSource[0].url, record.url);

    await db.close();
  });
});
