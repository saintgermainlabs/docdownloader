import assert from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import {
  resolveBaseOutputDir,
  resolveClippingDir,
  resolveKnowledgeRoot,
  resolveOutputDir,
} from '../src/storage/paths';

describe('paths module', () => {
  const originalHostEnv = process.env.HOST_ENV;
  const originalKnowledgeRoot = process.env.KNOWLEDGE_ROOT;

  afterEach(() => {
    process.env.HOST_ENV = originalHostEnv;
    if (originalKnowledgeRoot === undefined) {
      delete process.env.KNOWLEDGE_ROOT;
    } else {
      process.env.KNOWLEDGE_ROOT = originalKnowledgeRoot;
    }
  });

  test('resolves local output paths when HOST_ENV is not remote', () => {
    delete process.env.HOST_ENV;
    delete process.env.KNOWLEDGE_ROOT;

    assert.strictEqual(resolveKnowledgeRoot(), '/home/god/projects/knowledge');
    assert.strictEqual(resolveBaseOutputDir('repo'), './output');
    assert.strictEqual(resolveBaseOutputDir('list', 'awesome'), 'output/awesome');
    assert.strictEqual(resolveBaseOutputDir('clippings'), '/home/god/projects/knowledge/clippings');
    assert.strictEqual(resolveClippingDir(), '/home/god/projects/knowledge/clippings');

    assert.strictEqual(resolveOutputDir('react', 'repo'), 'output/react');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'awesome'), 'output/awesome/awesome-usecases');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'usecases'), 'output/usecases/awesome-usecases');
  });

  test('resolves remote output paths when HOST_ENV=remote', () => {
    process.env.HOST_ENV = 'remote';
    delete process.env.KNOWLEDGE_ROOT;

    assert.strictEqual(resolveKnowledgeRoot(), '/srv/knowledge');
    assert.strictEqual(resolveBaseOutputDir('repo'), '/srv/knowledge/documents');
    assert.strictEqual(resolveBaseOutputDir('list', 'awesome'), '/srv/knowledge/awesome');
    assert.strictEqual(resolveBaseOutputDir('list', 'usecases'), '/srv/knowledge/usecases');
    assert.strictEqual(resolveBaseOutputDir('clippings'), '/srv/knowledge/clippings');
    assert.strictEqual(resolveClippingDir(), '/srv/knowledge/clippings');

    assert.strictEqual(resolveOutputDir('react', 'repo'), '/srv/knowledge/documents/react');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'awesome'), '/srv/knowledge/awesome/awesome-usecases');
  });

  test('KNOWLEDGE_ROOT overrides clipping destination', () => {
    delete process.env.HOST_ENV;
    process.env.KNOWLEDGE_ROOT = '/tmp/kb-test';
    assert.strictEqual(resolveClippingDir(), '/tmp/kb-test/clippings');
  });

  test('clipping custom dir override wins', () => {
    assert.strictEqual(resolveClippingDir('./my-clips'), './my-clips');
  });
});
