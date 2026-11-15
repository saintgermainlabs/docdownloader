import assert from 'node:assert';
import { test, describe } from 'node:test';
import {
  chooseMainContent,
  defaultClipFilename,
  parseClipCliArgs,
  slugifyClipName,
  wrapClippingMarkdown,
} from '../src/scripts/clip';

describe('clip CLI helpers', () => {
  test('parses URL and flags', () => {
    const res = parseClipCliArgs([
      'https://example.com/post',
      '--title',
      'Hello World',
      '--filename',
      'hello.md',
      '--out',
      './clips',
      '--no-db',
    ]);
    assert.strictEqual(res.url, 'https://example.com/post');
    assert.strictEqual(res.title, 'Hello World');
    assert.strictEqual(res.filename, 'hello.md');
    assert.strictEqual(res.outputDir, './clips');
    assert.strictEqual(res.noDb, true);
    assert.strictEqual(res.help, false);
  });

  test('parses positional output dir', () => {
    const res = parseClipCliArgs(['https://example.com/a', './my-clips']);
    assert.strictEqual(res.url, 'https://example.com/a');
    assert.strictEqual(res.outputDir, './my-clips');
  });

  test('slugifies names', () => {
    assert.strictEqual(slugifyClipName('Hello World!'), 'hello-world');
    assert.strictEqual(slugifyClipName('https://Example.COM/Path'), 'example-com-path');
  });

  test('builds default filename with date prefix', () => {
    const name = defaultClipFilename('https://example.com/docs/building-plugins', 'Building Plugins');
    assert.match(name, /^\d{4}-\d{2}-\d{2}-building-plugins\.md$/);
  });

  test('wraps markdown with frontmatter', () => {
    const md = wrapClippingMarkdown('Title', 'https://example.com', '# Hello\n\nWorld');
    assert.match(md, /^---\n/);
    assert.match(md, /title: "Title"/);
    assert.match(md, /source: https:\/\/example.com/);
    assert.match(md, /type: clipping/);
    assert.match(md, /# Hello/);
  });
});


describe('chooseMainContent', () => {
  test('picks the candidate with the most text, not the first', () => {
    const pick = chooseMainContent([{ textLength: 120 }, { textLength: 5000 }, { textLength: 300 }], 6000);
    assert.strictEqual(pick, 1);
  });

  test('falls back to the body when the best candidate covers little of the page (Redoc)', () => {
    const many = Array.from({ length: 40 }, () => ({ textLength: 150 }));
    assert.strictEqual(chooseMainContent(many, 137000), -1);
  });

  test('ignores tiny candidates and handles none', () => {
    assert.strictEqual(chooseMainContent([{ textLength: 50 }], 60), -1);
    assert.strictEqual(chooseMainContent([], 1000), -1);
  });
});
