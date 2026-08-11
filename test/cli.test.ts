import assert from 'node:assert';
import { test, describe } from 'node:test';
import { parseCliArgs } from '../src/index';

describe('parseCliArgs', () => {
  test('parses single URL positional argument with defaults', () => {
    const res = parseCliArgs(['https://example.com/docs']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.outputDir, './output');
    assert.strictEqual(res.scope, 'subfolder');
    assert.strictEqual(res.concurrency, 1);
    assert.strictEqual(res.help, false);
  });

  test('parses --concurrency and -c flags', () => {
    const res1 = parseCliArgs(['https://example.com/docs', '--concurrency', '5']);
    assert.strictEqual(res1.concurrency, 5);

    const res2 = parseCliArgs(['https://example.com/docs', '-c', '10']);
    assert.strictEqual(res2.concurrency, 10);

    const res3 = parseCliArgs(['https://example.com/docs', '--concurrency=8']);
    assert.strictEqual(res3.concurrency, 8);
  });

  test('parses url and outputDir positional arguments', () => {
    const res = parseCliArgs(['https://example.com/docs', './my-out']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.outputDir, './my-out');
    assert.strictEqual(res.scope, 'subfolder');
  });

  test('parses url, outputDir, and scope positional arguments', () => {
    const res = parseCliArgs(['https://example.com/docs', './my-out', 'website']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.outputDir, './my-out');
    assert.strictEqual(res.scope, 'website');
  });

  test('parses scope passed as positional right after URL', () => {
    const res = parseCliArgs(['https://example.com/docs', 'website']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.outputDir, './output');
    assert.strictEqual(res.scope, 'website');
  });

  test('parses --scope flag', () => {
    const res = parseCliArgs(['https://example.com/docs', '--scope', 'website']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.scope, 'website');
  });

  test('parses --mode=subfolder flag', () => {
    const res = parseCliArgs(['https://example.com/docs', '--mode=subfolder']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.scope, 'subfolder');
  });

  test('parses boolean --website flag', () => {
    const res = parseCliArgs(['https://example.com/docs', './output', '--website']);
    assert.strictEqual(res.url, 'https://example.com/docs');
    assert.strictEqual(res.scope, 'website');
  });

  test('parses --db and --force flags', () => {
    const res1 = parseCliArgs(['https://example.com/docs', '--db', './custom.db', '--force']);
    assert.strictEqual(res1.dbPath, './custom.db');
    assert.strictEqual(res1.force, true);

    const res2 = parseCliArgs(['https://example.com/docs', '-f', '--db=./custom2.db']);
    assert.strictEqual(res2.dbPath, './custom2.db');
    assert.strictEqual(res2.force, true);
  });

  test('parses --name, --description, and --slug flags', () => {
    const res = parseCliArgs([
      'https://example.com/docs',
      '--name', 'Quartz Scheduler',
      '--description', 'Job scheduling service',
      '--slug', 'quartz-docs'
    ]);
    assert.strictEqual(res.name, 'Quartz Scheduler');
    assert.strictEqual(res.description, 'Job scheduling service');
    assert.strictEqual(res.slug, 'quartz-docs');
  });

  test('parses --help flag', () => {
    const res = parseCliArgs(['--help']);
    assert.strictEqual(res.help, true);
  });
});
