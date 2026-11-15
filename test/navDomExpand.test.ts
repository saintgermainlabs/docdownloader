import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { domExpandExtractor } from '../src/nav/extractors/domExpand';
import { BrowserManager } from '../src/crawler/browser';

const live = process.env.DOC_DL_LIVE_TESTS === '1';
const html = readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'collapsible-sidebar.html'), 'utf-8');
const simplify = (nodes: any[]): any[] =>
  nodes.map((n) => [n.type, n.name, n.url, ...(n.children ? [simplify(n.children)] : [])]);

describe('domExpand extractor (browser)', { skip: !live && 'set DOC_DL_LIVE_TESTS=1 (needs a browser)' }, () => {
  test('expands collapsed folders and reads the sidebar in order', async () => {
    const browser = new BrowserManager();
    await browser.init();
    try {
      const page = await browser.newPage();
      await page.route('https://docs.test/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('https://docs.test/docs/intro');
      const input = { page, url: page.url() };
      assert.ok(domExpandExtractor.matches(input));
      const nodes = await domExpandExtractor.extract(input);
      assert.deepStrictEqual(simplify(nodes), [
        ['separator', 'Get Started', undefined, [
          ['link', 'Intro', 'https://docs.test/docs/intro'],
          ['folder', 'Guides', undefined, [
            ['link', 'A', 'https://docs.test/docs/guides/a'],
            ['link', 'B', 'https://docs.test/docs/guides/b'],
            ['folder', 'More', undefined, [['link', 'C', 'https://docs.test/docs/guides/more/c']]],
          ]],
        ]],
        ['separator', 'Reference', undefined, [['link', 'API', 'https://docs.test/docs/api']]],
      ]);
    } finally {
      await browser.close();
    }
  });

  test('does not match without a page', () => {
    assert.strictEqual(domExpandExtractor.matches({ html: '<html></html>', url: 'https://x' }), false);
  });
});
