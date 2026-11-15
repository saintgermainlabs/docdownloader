import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeUrl, detectFrameworks, findFileLinks, FetchLike } from '../src/sources/probe';

const langfuse = readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'langfuse-docs.html'), 'utf-8');

type Route = { status?: number; url?: string; body?: string; contentType?: string; reject?: string };

function fakeFetch(routes: Record<string, Route>, calls: string[] = []): FetchLike {
  return async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return { status: 404, url, headers: { get: () => null }, text: async () => '' };
    if (r.reject) throw new Error(r.reject);
    return {
      status: r.status ?? 200,
      url: r.url ?? url,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? r.contentType ?? 'text/html' : null) },
      text: async () => r.body ?? '',
    };
  };
}

const richHtml = `<html><body><main>${'Documentation text. '.repeat(30)}</main></body></html>`;

describe('probeUrl', () => {
  test('follows redirects and uses the final origin for llms.txt', async () => {
    const calls: string[] = [];
    const probe = await probeUrl(
      'http://site.test/docs',
      fakeFetch({ 'http://site.test/docs': { url: 'https://site.test/docs/', body: richHtml } }, calls)
    );
    assert.strictEqual(probe.finalUrl, 'https://site.test/docs/');
    assert.ok(calls.includes('https://site.test/llms.txt'));
    assert.ok(calls.includes('https://site.test/sitemap.xml'));
  });

  test('missing llms.txt is undefined; sitemap locs are collected', async () => {
    const sitemap = '<urlset><url><loc>https://s.test/a</loc></url><url><loc>https://s.test/b</loc></url><url><loc>https://s.test/c</loc></url></urlset>';
    const probe = await probeUrl(
      'https://s.test/',
      fakeFetch({ 'https://s.test/': { body: richHtml }, 'https://s.test/sitemap.xml': { body: sitemap, contentType: 'application/xml' } })
    );
    assert.strictEqual(probe.llmsTxt, undefined);
    assert.strictEqual(probe.sitemapUrls?.length, 3);
  });

  test('a sitemap index is flagged as such', async () => {
    const idx = '<sitemapindex><sitemap><loc>https://s.test/sitemap-0.xml</loc></sitemap></sitemapindex>';
    const probe = await probeUrl(
      'https://s.test/',
      fakeFetch({ 'https://s.test/': { body: richHtml }, 'https://s.test/sitemap.xml': { body: idx } })
    );
    assert.strictEqual(probe.sitemapIsIndex, true);
    assert.deepStrictEqual(probe.sitemapUrls, ['https://s.test/sitemap-0.xml']);
  });

  test('a failing side request is recorded without failing the probe', async () => {
    const probe = await probeUrl(
      'https://s.test/',
      fakeFetch({ 'https://s.test/': { body: richHtml }, 'https://s.test/sitemap.xml': { reject: 'timeout' } })
    );
    assert.ok(probe.errors['sitemap']);
    assert.strictEqual(probe.status, 200);
    assert.ok(probe.html);
  });

  test('an unreachable main URL rejects with the URL in the message', async () => {
    await assert.rejects(
      probeUrl('https://down.test/x', fakeFetch({ 'https://down.test/x': { reject: 'ENOTFOUND' } })),
      /https:\/\/down\.test\/x/
    );
  });

  test('JS-only page needs a browser', async () => {
    const probe = await probeUrl(
      'https://spa.test/',
      fakeFetch({ 'https://spa.test/': { body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' } })
    );
    assert.strictEqual(probe.needsBrowser, true);
  });

  test('rich page does not need a browser', async () => {
    const probe = await probeUrl('https://s.test/', fakeFetch({ 'https://s.test/': { body: richHtml } }));
    assert.strictEqual(probe.needsBrowser, false);
  });
});

describe('detectFrameworks', () => {
  test('recognises fumadocs and docusaurus', () => {
    assert.ok(detectFrameworks(langfuse).includes('fumadocs'));
    assert.ok(detectFrameworks('<meta name="generator" content="Docusaurus v3.1">').includes('docusaurus'));
    assert.deepStrictEqual(detectFrameworks('<html><body>plain</body></html>'), []);
  });
});

describe('findFileLinks', () => {
  test('finds document links case-insensitively as absolute URLs', () => {
    assert.deepStrictEqual(findFileLinks('<a href="/a.PDF">x</a><a href="/b.html">y</a>', 'https://s/'), ['https://s/a.PDF']);
  });
});
