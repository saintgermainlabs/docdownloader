import assert from 'node:assert';
import { test, describe } from 'node:test';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDetect } from '../src/cli/detect';
import { main } from '../src/index';

// Hits real websites and needs a browser. Run with:
//   DOC_DL_LIVE_TESTS=1 [DOC_DL_BROWSER_CHANNEL=chrome] npm test
const live = process.env.DOC_DL_LIVE_TESTS === '1';

async function detectJson(url: string): Promise<any> {
  let text = '';
  const code = await runDetect([url, '--json'], { out: (s) => (text += s) });
  assert.strictEqual(code, 0);
  return JSON.parse(text);
}

describe('live: detect + crawl', { skip: !live && 'set DOC_DL_LIVE_TESTS=1', timeout: 600_000 }, () => {
  test('Langfuse docs are detected as Fumadocs with a sidebar tree', async () => {
    const res = await detectJson('https://langfuse.com/docs');
    const top = res.findings[0];
    assert.strictEqual(top.kind, 'docs-site');
    assert.strictEqual(top.details.framework, 'fumadocs');
    assert.ok(top.details.pages > 50, `pages=${top.details.pages}`);
  });

  test('crawling a Langfuse subsection writes numbered folders and _tree.json', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ddl-live-'));
    const summary = await main(
      'https://langfuse.com/docs/prompt-management',
      out,
      'subfolder',
      3,
      join(out, 'docs.db'),
      false,
      undefined,
      undefined,
      'prompt-management',
      false,
      'nav'
    );
    assert.ok(existsSync(join(out, '_tree.json')));
    const tree = JSON.parse(readFileSync(join(out, '_tree.json'), 'utf-8'));
    assert.strictEqual(tree.framework, 'fumadocs');
    const top = readdirSync(out);
    assert.ok(top.some((n) => /^\d{2,}-/.test(n)), `top-level entries: ${top.join(', ')}`);
    assert.ok(summary.downloaded > 3, `downloaded=${summary.downloaded}`);
  });

  test('GitHub repo with mkdocs.yml yields a doc-folder with its sidebar config', async () => {
    const res = await detectJson('https://github.com/mkdocs/mkdocs');
    const folder = res.findings.find((f: any) => f.kind === 'doc-folder');
    assert.ok(folder, 'doc-folder finding');
    assert.strictEqual(folder.details.navConfig, 'mkdocs');
  });
});
