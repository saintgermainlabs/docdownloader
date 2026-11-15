import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdocsExtractor } from '../src/nav/extractors/mkdocs';
import { summaryMdExtractor } from '../src/nav/extractors/summaryMd';
import { docusaurusExtractor } from '../src/nav/extractors/docusaurus';
import { fumadocsMetaExtractor } from '../src/nav/extractors/fumadocsMeta';
import { findNavConfigs } from '../src/nav/repoConfigs';

const fx = (name: string) => readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', name), 'utf-8');
const REPO = 'https://github.com/o/r';
const simplify = (nodes: any[]): any[] =>
  nodes.map((n) => [n.type, n.name, n.url, ...(n.children ? [simplify(n.children)] : [])]);

describe('mkdocs reader', () => {
  test('maps nav with default docs_dir', async () => {
    const files = new Map([['mkdocs.yml', fx('repo-mkdocs.yml')]]);
    const input = { url: REPO, repoFiles: files, configPath: 'mkdocs.yml' };
    assert.ok(mkdocsExtractor.matches(input));
    assert.deepStrictEqual(simplify(await mkdocsExtractor.extract(input)), [
      ['link', 'Home', 'docs/index.md'],
      ['folder', 'Guide', undefined, [
        ['link', 'Install', 'docs/guide/install.md'],
        ['link', 'usage', 'docs/guide/usage.md'],
      ]],
      ['link', 'GitHub', 'https://github.com/example/example'],
    ]);
  });

  test('honours docs_dir and a nested config folder', async () => {
    const files = new Map([['site/mkdocs.yml', 'docs_dir: content\nnav:\n  - Home: index.md\n']]);
    const nodes = await mkdocsExtractor.extract({ url: REPO, repoFiles: files, configPath: 'site/mkdocs.yml' });
    assert.deepStrictEqual(simplify(nodes), [['link', 'Home', 'site/content/index.md']]);
  });
});

describe('SUMMARY.md reader', () => {
  test('headings become separators and nested items become folders', async () => {
    const files = new Map([['SUMMARY.md', fx('repo-SUMMARY.md')]]);
    const nodes = await summaryMdExtractor.extract({ url: REPO, repoFiles: files, configPath: 'SUMMARY.md' });
    assert.deepStrictEqual(simplify(nodes), [
      ['separator', 'Part 1', undefined, [
        ['folder', 'Intro', 'intro.md', [['link', 'Deep', 'a/deep.md']]],
        ['link', 'Second', 'second.md'],
      ]],
    ]);
  });

  test('paths are relative to the SUMMARY.md folder', async () => {
    const files = new Map([['book/SUMMARY.md', '- [A](a.md)\n']]);
    const nodes = await summaryMdExtractor.extract({ url: REPO, repoFiles: files, configPath: 'book/SUMMARY.md' });
    assert.deepStrictEqual(simplify(nodes), [['link', 'A', 'book/a.md']]);
  });
});

describe('docusaurus reader', () => {
  test('parses plain object sidebars without running code', async () => {
    const files = new Map([
      ['sidebars.js', fx('repo-sidebars.js')],
      ['docs/intro.md', ''],
      ['docs/setup.mdx', ''],
    ]);
    const nodes = await docusaurusExtractor.extract({ url: REPO, repoFiles: files, configPath: 'sidebars.js' });
    assert.deepStrictEqual(simplify(nodes), [
      ['folder', 'Basics', undefined, [
        ['link', 'intro', 'docs/intro.md'],
        ['link', 'Set up', 'docs/setup.mdx'],
      ]],
      ['link', 'Website', 'https://example.com'],
    ]);
  });

  test('dynamic sidebars yield an empty tree without throwing', async () => {
    const files = new Map([['sidebars.js', fx('repo-sidebars-dynamic.js')]]);
    assert.deepStrictEqual(
      await docusaurusExtractor.extract({ url: REPO, repoFiles: files, configPath: 'sidebars.js' }),
      []
    );
  });
});

describe('fumadocs meta.json reader', () => {
  test('pages order with separators and sub-folders', async () => {
    const files = new Map([
      ['content/docs/meta.json', JSON.stringify({ pages: ['index', '---Guides---', 'setup', 'advanced'] })],
      ['content/docs/index.mdx', ''],
      ['content/docs/setup.mdx', ''],
      ['content/docs/advanced/meta.json', JSON.stringify({ title: 'Advanced', pages: ['tuning'] })],
      ['content/docs/advanced/tuning.md', ''],
    ]);
    const nodes = await fumadocsMetaExtractor.extract({ url: REPO, repoFiles: files, configPath: 'content/docs/meta.json' });
    assert.deepStrictEqual(simplify(nodes), [
      ['link', 'index', 'content/docs/index.mdx'],
      ['separator', 'Guides', undefined, [
        ['link', 'setup', 'content/docs/setup.mdx'],
        ['folder', 'Advanced', undefined, [['link', 'tuning', 'content/docs/advanced/tuning.md']]],
      ]],
    ]);
  });
});

describe('findNavConfigs', () => {
  test('finds configs and their roots', () => {
    assert.deepStrictEqual(findNavConfigs(['docs/mkdocs.yml', 'README.md', 'book/SUMMARY.md']), [
      { extractor: 'mkdocs', configPath: 'docs/mkdocs.yml', root: 'docs' },
      { extractor: 'summary-md', configPath: 'book/SUMMARY.md', root: 'book' },
    ]);
  });

  test('only the top-most fumadocs meta.json counts', () => {
    assert.deepStrictEqual(findNavConfigs(['content/docs/meta.json', 'content/docs/a/meta.json']), [
      { extractor: 'fumadocs-meta', configPath: 'content/docs/meta.json', root: 'content/docs' },
    ]);
  });

  test('ignores node_modules', () => {
    assert.deepStrictEqual(findNavConfigs(['node_modules/x/mkdocs.yml']), []);
  });
});
