import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fumadocsExtractor } from '../src/nav/extractors/fumadocs';
import { extractNav } from '../src/nav/registry';
import { NavNode } from '../src/nav/types';

const fixture = readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'langfuse-docs.html'), 'utf-8');
const URL_ = 'https://langfuse.com/docs';

function findSeparator(nodes: NavNode[], name: string): Extract<NavNode, { type: 'separator' }> | undefined {
  for (const n of nodes) {
    if (n.type === 'separator' && n.name === name) return n;
    if (n.type !== 'link') {
      const hit = findSeparator(n.children, name);
      if (hit) return hit;
    }
  }
  return undefined;
}

describe('fumadocs extractor', () => {
  test('matches the Langfuse page and not plain HTML', () => {
    assert.strictEqual(fumadocsExtractor.matches({ html: fixture, url: URL_ }), true);
    assert.strictEqual(fumadocsExtractor.matches({ html: '<html><body>hi</body></html>', url: URL_ }), false);
  });

  test('extracts the Get Started with section with nested folder', async () => {
    const nodes = await fumadocsExtractor.extract({ html: fixture, url: URL_ });
    const section = findSeparator(nodes, 'Get Started with');
    assert.ok(section, 'separator "Get Started with" found');
    const [first, second] = section!.children;
    assert.deepStrictEqual(first, {
      type: 'link',
      name: 'Tracing',
      url: 'https://langfuse.com/docs/observability/get-started',
    });
    assert.strictEqual(second.type, 'folder');
    assert.strictEqual(second.name, 'Prompt & Skill Management');
    const kids = (second as any).children as NavNode[];
    assert.deepStrictEqual(
      kids.map((k) => [k.type, k.name, (k as any).url]),
      [
        ['link', 'Prompt Management', 'https://langfuse.com/docs/prompt-management/get-started'],
        ['link', 'Skill Management', 'https://langfuse.com/docs/skill-management/get-started'],
      ]
    );
  });

  test('all link URLs are absolute', async () => {
    const nodes = await fumadocsExtractor.extract({ html: fixture, url: URL_ });
    const urls: string[] = [];
    const walk = (list: NavNode[]) =>
      list.forEach((n) => {
        if (n.type === 'link' || (n.type === 'folder' && n.url)) urls.push((n as any).url);
        if (n.type !== 'link') walk(n.children);
      });
    walk(nodes);
    assert.ok(urls.length > 20);
    assert.ok(urls.every((u) => /^https?:\/\//.test(u)), 'every url absolute');
  });
});

describe('nav registry', () => {
  test('returns fumadocs result for Langfuse', async () => {
    const res = await extractNav({ html: fixture, url: URL_ });
    assert.strictEqual(res?.framework, 'fumadocs');
    assert.ok(res!.nodes.length > 0);
  });

  test('returns null when no extractor finds a tree', async () => {
    assert.strictEqual(await extractNav({ html: '<html></html>', url: URL_ }), null);
  });
});
