import assert from 'node:assert';
import { test, describe } from 'node:test';
import { slugifyLabel, normalizeSeparators, planLayout, buildTreeJson } from '../src/nav/layout';
import { NavNode } from '../src/nav/types';

const link = (name: string, url: string): NavNode => ({ type: 'link', name, url });
const sep = (name: string, children: NavNode[] = []): NavNode => ({ type: 'separator', name, children });
const folder = (name: string, children: NavNode[], url?: string): NavNode => ({ type: 'folder', name, children, url });

const BASE = 'https://langfuse.com/docs';
const inScope = (u: string) => u.startsWith('https://langfuse.com/docs');

describe('slugifyLabel', () => {
  test('lowercases and hyphenates', () => {
    assert.strictEqual(slugifyLabel('Get Started with'), 'get-started-with');
  });
  test('turns & into and', () => {
    assert.strictEqual(slugifyLabel('Prompt & Skill Management'), 'prompt-and-skill-management');
  });
  test('keeps non-ASCII letters', () => {
    assert.strictEqual(slugifyLabel('快速开始'), '快速开始');
    assert.strictEqual(slugifyLabel('Café Résumé'), 'café-résumé');
  });
  test('emoji-only label becomes empty', () => {
    assert.strictEqual(slugifyLabel('🚀'), '');
  });
});

describe('normalizeSeparators', () => {
  test('flat separators own the following items', () => {
    const out = normalizeSeparators([sep('A'), link('x', '/x'), sep('B'), link('y', '/y')]);
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out.map((n) => n.type), ['separator', 'separator']);
    assert.strictEqual((out[0] as any).children[0].name, 'x');
    assert.strictEqual((out[1] as any).children[0].name, 'y');
  });
  test('items before the first separator stay at top level', () => {
    const out = normalizeSeparators([link('o', '/o'), sep('A'), link('x', '/x')]);
    assert.deepStrictEqual(out.map((n) => n.type), ['link', 'separator']);
  });
});

describe('planLayout', () => {
  const langfuse: NavNode[] = [
    link('Overview', '/docs'),
    sep('Get Started with', [
      link('Tracing', '/docs/observability/get-started'),
      folder('Prompt & Skill Management', [
        link('Prompt Management', '/docs/prompt-management/get-started'),
        link('Skill Management', '/docs/skill-management/get-started'),
      ]),
    ]),
  ];

  test('Langfuse shape becomes numbered folders', () => {
    const plan = planLayout(langfuse, { baseUrl: BASE, inScope });
    assert.strictEqual(plan.paths.get('https://langfuse.com/docs'), '01-overview.md');
    assert.strictEqual(plan.paths.get('https://langfuse.com/docs/observability/get-started'), '02-get-started-with/01-tracing.md');
    assert.strictEqual(
      plan.paths.get('https://langfuse.com/docs/prompt-management/get-started'),
      '02-get-started-with/02-prompt-and-skill-management/01-prompt-management.md'
    );
    assert.strictEqual(
      plan.paths.get('https://langfuse.com/docs/skill-management/get-started'),
      '02-get-started-with/02-prompt-and-skill-management/02-skill-management.md'
    );
  });

  test('folder with its own page gets 00-index.md', () => {
    const plan = planLayout([folder('Guides', [link('A', '/docs/guides/a')], '/docs/guides')], { baseUrl: BASE, inScope });
    assert.strictEqual(plan.paths.get('https://langfuse.com/docs/guides'), '01-guides/00-index.md');
  });

  test('padding follows sibling count', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => link(`P${i}`, `/docs/p${i}`));
    assert.ok(planLayout(twelve, { baseUrl: BASE, inScope }).paths.get('https://langfuse.com/docs/p0')!.startsWith('01-'));
    const hundred = Array.from({ length: 100 }, (_, i) => link(`P${i}`, `/docs/p${i}`));
    assert.ok(planLayout(hundred, { baseUrl: BASE, inScope }).paths.get('https://langfuse.com/docs/p0')!.startsWith('001-'));
  });

  test('sibling slug collisions get distinct hash suffixes', () => {
    const plan = planLayout([link('C#', '/docs/cs'), link('C++', '/docs/cpp')], { baseUrl: BASE, inScope });
    const a = plan.paths.get('https://langfuse.com/docs/cs')!;
    const b = plan.paths.get('https://langfuse.com/docs/cpp')!;
    assert.match(a, /^01-c-[0-9a-f]{8}\.md$/);
    assert.match(b, /^02-c-[0-9a-f]{8}\.md$/);
    assert.notStrictEqual(a.slice(3), b.slice(3));
  });

  test('empty slug falls back to last URL segment', () => {
    const plan = planLayout([link('🚀', '/docs/launch')], { baseUrl: BASE, inScope });
    assert.strictEqual(plan.paths.get('https://langfuse.com/docs/launch'), '01-launch.md');
  });

  test('duplicate URL is saved once and referenced', () => {
    const plan = planLayout([link('A', '/docs/a'), link('Again', '/docs/a/')], { baseUrl: BASE, inScope });
    assert.strictEqual(plan.paths.size, 1);
    assert.strictEqual(plan.tree[1].ref, '01-a.md');
    assert.strictEqual(plan.tree[1].path, undefined);
  });

  test('out-of-scope links are external and not planned', () => {
    const plan = planLayout([link('GitHub', 'https://github.com/x')], { baseUrl: BASE, inScope });
    assert.strictEqual(plan.paths.size, 0);
    assert.strictEqual(plan.tree[0].external, true);
  });

  test('URL keys ignore hash and trailing slash', () => {
    const plan = planLayout([link('A', '/docs/a/#top')], { baseUrl: BASE, inScope });
    assert.strictEqual(plan.paths.get('https://langfuse.com/docs/a'), '01-a.md');
  });
});

describe('buildTreeJson', () => {
  test('has source, framework, extractedAt and tree', () => {
    const plan = planLayout([link('A', '/docs/a')], { baseUrl: BASE, inScope });
    const json: any = buildTreeJson(plan, { source: BASE, framework: 'fumadocs' });
    assert.strictEqual(json.source, BASE);
    assert.strictEqual(json.framework, 'fumadocs');
    assert.ok(!isNaN(Date.parse(json.extractedAt)));
    assert.strictEqual(json.tree[0].path, '01-a.md');
  });
});
