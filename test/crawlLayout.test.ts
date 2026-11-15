import assert from 'node:assert';
import { test, describe } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchPlannedPath, unlistedPath, shouldSavePage, relocateIfMoved, redirectTarget } from '../src/nav/crawlLayout';
import { planLayout } from '../src/nav/layout';
import { FileStorage } from '../src/storage/fileSystem';
import { parseCliArgs } from '../src/index';

describe('crawl layout helpers', () => {
  const plan = planLayout(
    [{ type: 'link', name: 'Tracing', url: '/docs/observability/get-started' }],
    { baseUrl: 'https://langfuse.com/docs', inScope: () => true }
  );

  test('matchPlannedPath tolerates trailing slash, hash and exact form', () => {
    for (const u of [
      'https://langfuse.com/docs/observability/get-started/',
      'https://langfuse.com/docs/observability/get-started#intro',
      'https://langfuse.com/docs/observability/get-started',
    ]) {
      assert.strictEqual(matchPlannedPath(plan, u), '01-tracing.md', u);
    }
    assert.strictEqual(matchPlannedPath(plan, 'https://langfuse.com/docs/other'), undefined);
  });

  test('unlistedPath mirrors the URL under _unlisted/', () => {
    assert.strictEqual(unlistedPath(new URL('https://x/docs/a/b/')), '_unlisted/docs/a/b/index.md');
    assert.strictEqual(unlistedPath(new URL('https://x/docs/a')), '_unlisted/docs/a.md');
    assert.strictEqual(unlistedPath(new URL('https://x/')), '_unlisted/index.md');
  });

  test('redirectTarget returns the final URL only when it differs', () => {
    assert.strictEqual(
      redirectTarget('https://x/docs/a', 'https://x/docs/b'),
      'https://x/docs/b'
    );
    assert.strictEqual(redirectTarget('https://x/docs/a', 'https://x/docs/a/'), undefined);
    assert.strictEqual(redirectTarget('https://x/docs/a', 'https://x/docs/a#top'), undefined);
  });

  test('shouldSavePage rejects HTTP errors only', () => {
    assert.strictEqual(shouldSavePage(200), true);
    assert.strictEqual(shouldSavePage(304), true);
    assert.strictEqual(shouldSavePage(undefined), true);
    assert.strictEqual(shouldSavePage(404), false);
    assert.strictEqual(shouldSavePage(500), false);
  });

  test('saveMarkdownAt writes frontmatter and creates folders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-save-'));
    const storage = new FileStorage(dir);
    const res = await storage.saveMarkdownAt('02-a/01-b.md', '# Body', { title: 'B: "x"', source_url: 'https://x/b' });
    const text = readFileSync(join(dir, '02-a/01-b.md'), 'utf-8');
    assert.match(text, /^---\ntitle: "B: \\"x\\""\nsource_url: "https:\/\/x\/b"\n---\n\n# Body/);
    assert.strictEqual(res.relativeFilePath, join(dir, '02-a/01-b.md'));
  });

  test('relocateIfMoved moves an existing file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-move-'));
    mkdirSync(join(dir, 'old'), { recursive: true });
    writeFileSync(join(dir, 'old/a.md'), 'x');
    assert.strictEqual(await relocateIfMoved(dir, 'old/a.md', 'new/01-a.md'), true);
    assert.ok(existsSync(join(dir, 'new/01-a.md')));
    assert.ok(!existsSync(join(dir, 'old/a.md')));
  });

  test('relocateIfMoved is a no-op when missing or unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-move-'));
    assert.strictEqual(await relocateIfMoved(dir, 'nope.md', 'x.md'), false);
    writeFileSync(join(dir, 'same.md'), 'x');
    assert.strictEqual(await relocateIfMoved(dir, 'same.md', 'same.md'), false);
  });
});

describe('parseCliArgs --layout', () => {
  test('defaults to nav', () => {
    assert.strictEqual(parseCliArgs(['https://x/docs']).layout, 'nav');
  });
  test('accepts --layout url and --layout=nav', () => {
    assert.strictEqual(parseCliArgs(['https://x/docs', '--layout', 'url']).layout, 'url');
    assert.strictEqual(parseCliArgs(['https://x/docs', '--layout=nav']).layout, 'nav');
  });
});
