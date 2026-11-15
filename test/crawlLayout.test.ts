import assert from 'node:assert';
import { test, describe } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchPlannedPath, unlistedPath, shouldSavePage, relocateIfMoved, redirectTarget, carryPlannedPath, queueKey, scopeBaseAfterRedirect } from '../src/nav/crawlLayout';
import { computeHash } from '../src/storage/database';
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

  test('carryPlannedPath moves a sidebar slot to the redirect target', () => {
    const p = planLayout([{ type: 'link', name: 'Tracing', url: '/docs/tracing' }], { baseUrl: 'https://x/docs', inScope: () => true });
    assert.strictEqual(carryPlannedPath(p, 'https://x/docs/tracing', 'https://x/docs/tracing/overview'), true);
    assert.strictEqual(matchPlannedPath(p, 'https://x/docs/tracing/overview'), '01-tracing.md');
    assert.strictEqual(carryPlannedPath(p, 'https://x/docs/none', 'https://x/docs/other'), false);
  });

  test('queueKey collapses trailing slashes when a plan exists', () => {
    assert.strictEqual(queueKey('https://x/docs/a/', true), 'https://x/docs/a');
    assert.strictEqual(queueKey('https://x/docs/a/#h', true), 'https://x/docs/a');
    assert.strictEqual(queueKey('https://x/docs/a/', false), 'https://x/docs/a/');
  });

  test('scopeBaseAfterRedirect follows a redirected seed (http -> https)', () => {
    assert.strictEqual(scopeBaseAfterRedirect('http://x/docs/', 'https://x/docs/'), 'https://x/docs/');
    assert.strictEqual(scopeBaseAfterRedirect('https://x/docs/', 'https://x/docs'), 'https://x/docs/');
  });

  test('scopeBaseAfterRedirect keeps the start path when the seed redirects deeper', () => {
    assert.strictEqual(
      scopeBaseAfterRedirect('https://x/docs/prompt-management', 'https://x/docs/prompt-management/overview'),
      'https://x/docs/prompt-management'
    );
    assert.strictEqual(scopeBaseAfterRedirect('http://x.com/docs/a', 'https://www.x.com/docs/a/b'), 'https://www.x.com/docs/a');
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
    assert.strictEqual(await relocateIfMoved(dir, 'old/a.md', 'new/01-a.md'), 'moved');
    assert.ok(existsSync(join(dir, 'new/01-a.md')));
    assert.ok(!existsSync(join(dir, 'old/a.md')));
  });

  test('relocateIfMoved is a no-op when missing or unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-move-'));
    assert.strictEqual(await relocateIfMoved(dir, 'nope.md', 'x.md'), 'stale');
    writeFileSync(join(dir, 'same.md'), 'x');
    assert.strictEqual(await relocateIfMoved(dir, 'same.md', 'same.md'), 'unchanged');
  });

  test('relocateIfMoved refuses a file overwritten by another page', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-move-'));
    writeFileSync(join(dir, '01-overview.md'), '---\ntitle: "Y"\nsource_url: "https://x/y"\n---\n\nY body');
    const res = await relocateIfMoved(dir, '01-overview.md', '_unlisted/x.md', computeHash('X body'));
    assert.strictEqual(res, 'stale');
    assert.ok(existsSync(join(dir, '01-overview.md')), "Y's file is left alone");
    assert.ok(!existsSync(join(dir, '_unlisted/x.md')));
  });

  test('relocateIfMoved moves when the body hash matches', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-move-'));
    writeFileSync(join(dir, 'a.md'), '---\ntitle: "X"\nsource_url: "https://x/x"\n---\n\nX body');
    assert.strictEqual(await relocateIfMoved(dir, 'a.md', 'b/a.md', computeHash('X body')), 'moved');
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
