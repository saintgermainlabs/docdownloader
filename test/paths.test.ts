import assert from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { resolveBaseOutputDir, resolveOutputDir } from '../src/storage/paths';

describe('paths module', () => {
  const originalEnv = process.env.HOST_ENV;

  afterEach(() => {
    process.env.HOST_ENV = originalEnv;
  });

  test('resolves local output paths when HOST_ENV is not remote', () => {
    delete process.env.HOST_ENV;

    assert.strictEqual(resolveBaseOutputDir('repo'), './output');
    assert.strictEqual(resolveBaseOutputDir('list', 'awesome'), 'output/awesome');

    assert.strictEqual(resolveOutputDir('react', 'repo'), 'output/react');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'awesome'), 'output/awesome/awesome-usecases');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'usecases'), 'output/usecases/awesome-usecases');
  });

  test('resolves remote output paths when HOST_ENV=remote', () => {
    process.env.HOST_ENV = 'remote';

    assert.strictEqual(resolveBaseOutputDir('repo'), '/srv/knowledge/documentation');
    assert.strictEqual(resolveBaseOutputDir('list', 'awesome'), '/srv/knowledge/awesome');
    assert.strictEqual(resolveBaseOutputDir('list', 'usecases'), '/srv/knowledge/usecases');

    assert.strictEqual(resolveOutputDir('react', 'repo'), '/srv/knowledge/documentation/react');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'awesome'), '/srv/knowledge/awesome/awesome-usecases');
  });
});
