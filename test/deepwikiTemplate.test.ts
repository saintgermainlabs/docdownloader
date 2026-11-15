import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDeepwikiStructure, deepwikiTemplate } from '../src/sources/templates/deepwiki';
import { httpMcpClient, McpClient } from '../src/sources/mcpClient';
import { Probe } from '../src/sources/types';

const fx = (n: string) => readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', n), 'utf-8');
const structure = fx('deepwiki-structure.txt');
const contents = fx('deepwiki-contents.txt');

const okClient: McpClient = {
  async callTool(name) {
    return name === 'read_wiki_structure' ? structure : contents;
  },
};
const probe = (url: string): Probe => ({
  url, finalUrl: url, status: 429, frameworks: [], fileLinks: [], needsBrowser: false, errors: {},
});
const URL_ = 'https://deepwiki.com/mkdocs/mkdocs';

describe('parseDeepwikiStructure', () => {
  test('numbered topics become a nested tree', () => {
    const nodes = parseDeepwikiStructure(structure, URL_);
    assert.strictEqual(nodes[0].type, 'folder');
    assert.strictEqual(nodes[0].name, 'Overview');
    assert.strictEqual((nodes[0] as any).url, `${URL_}/1-overview`);
    assert.deepStrictEqual(
      (nodes[0] as any).children.map((c: any) => [c.type, c.name, c.url]),
      [
        ['link', 'Architecture', `${URL_}/1.1-architecture`],
        ['link', 'Core Concepts', `${URL_}/1.2-core-concepts`],
      ]
    );
    assert.strictEqual(nodes.length, 8);
  });
});

describe('deepwiki template', () => {
  test('ignores non-DeepWiki URLs', async () => {
    assert.deepStrictEqual(await deepwikiTemplate(okClient).detect(probe('https://github.com/mkdocs/mkdocs')), []);
  });

  test('detect: runnable wiki finding plus GitHub suggestion', async () => {
    const fs = await deepwikiTemplate(okClient).detect(probe(URL_));
    const wiki = fs.find((f) => f.kind === 'wiki')!;
    assert.strictEqual(wiki.runnable, true);
    assert.strictEqual(wiki.confidence, 0.95);
    assert.ok((wiki.details?.pages as number) > 30);
    const gh = fs.find((f) => f.url === 'https://github.com/mkdocs/mkdocs')!;
    assert.strictEqual(gh.runnable, false);
  });

  test('unavailable server: finding not runnable, GitHub suggestion kept', async () => {
    const failing: McpClient = { callTool: async () => { throw new Error('HTTP 429 Too Many Requests'); } };
    const fs = await deepwikiTemplate(failing).detect(probe(URL_));
    const wiki = fs.find((f) => f.kind === 'wiki')!;
    assert.strictEqual(wiki.runnable, false);
    assert.match(wiki.summary, /unavailable/);
    assert.ok(fs.some((f) => f.url === 'https://github.com/mkdocs/mkdocs'));
  });

  test('run writes numbered pages and _tree.json into outputDir', async () => {
    const t = deepwikiTemplate(okClient);
    const wiki = (await t.detect(probe(URL_))).find((f) => f.kind === 'wiki')!;
    const out = mkdtempSync(join(tmpdir(), 'ddl-dw-'));
    const res = await t.run!(wiki, { outputDir: out });
    assert.ok(existsSync(join(out, '01-overview', '00-index.md')));
    assert.ok(existsSync(join(out, '01-overview', '01-architecture.md')));
    const page = readFileSync(join(out, '01-overview', '01-architecture.md'), 'utf-8');
    assert.match(page, /source_url: "https:\/\/deepwiki\.com\/mkdocs\/mkdocs\/1\.1-architecture"/);
    assert.match(page, /Synthetic body for Architecture/);
    const tree = JSON.parse(readFileSync(join(out, '_tree.json'), 'utf-8'));
    assert.strictEqual(tree.framework, 'deepwiki');
    assert.strictEqual(res.filesWritten, 4, 'only pages present in contents are written');
    assert.ok(res.warnings.some((w) => /missing from wiki contents/.test(w)));
  });

  test('run without outputDir uses <knowledge-root>/deepwiki/<owner>-<repo>', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ddl-kr-'));
    const prev = process.env.KNOWLEDGE_ROOT;
    process.env.KNOWLEDGE_ROOT = root;
    try {
      const t = deepwikiTemplate(okClient);
      const wiki = (await t.detect(probe(URL_))).find((f) => f.kind === 'wiki')!;
      const res = await t.run!(wiki, {});
      assert.strictEqual(res.outputDir, join(root, 'deepwiki', 'mkdocs-mkdocs'));
      assert.ok(existsSync(join(res.outputDir, '_tree.json')));
    } finally {
      if (prev === undefined) delete process.env.KNOWLEDGE_ROOT;
      else process.env.KNOWLEDGE_ROOT = prev;
    }
  });
});

describe('httpMcpClient', () => {
  const fakeFetch = (status: number, body: string) =>
    (async () => ({ status, url: '', headers: { get: () => null }, text: async () => body })) as any;

  test('parses SSE tool results', async () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"hello"}],"isError":false}}\n\n';
    assert.strictEqual(await httpMcpClient('https://x/mcp', fakeFetch(200, body)).callTool('t', {}), 'hello');
  });

  test('throws on HTTP 429 and on tool errors', async () => {
    await assert.rejects(httpMcpClient('https://x/mcp', fakeFetch(429, '')).callTool('t', {}), /429/);
    const err = '{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"nope"}],"isError":true}}';
    await assert.rejects(httpMcpClient('https://x/mcp', fakeFetch(200, err)).callTool('t', {}), /nope/);
  });
});
