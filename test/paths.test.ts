import assert from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import {
  resolveBaseOutputDir,
  resolveClippingDir,
  resolveSkillsDir,
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

  test('defaults to ./output when no knowledge root is configured', () => {
    delete process.env.HOST_ENV;
    delete process.env.KNOWLEDGE_ROOT;
    delete process.env.OBSIDIAN_VAULT_PATH;

    assert.strictEqual(resolveKnowledgeRoot(), './output');
    assert.strictEqual(resolveBaseOutputDir('repo'), './output');
    assert.strictEqual(resolveBaseOutputDir('list', 'awesome'), 'output/awesome');
    assert.strictEqual(resolveBaseOutputDir('clippings'), 'output/clippings');
    assert.strictEqual(resolveClippingDir(), 'output/clippings');
    assert.strictEqual(resolveBaseOutputDir('skills'), 'output/skills');
    assert.strictEqual(resolveSkillsDir(), 'output/skills');
    assert.strictEqual(resolveOutputDir('react', 'repo'), 'output/react');
  });

  test('KNOWLEDGE_ROOT wins over HOST_ENV=remote', () => {
    process.env.HOST_ENV = 'remote';
    process.env.KNOWLEDGE_ROOT = '/tmp/kb-test';
    assert.strictEqual(resolveKnowledgeRoot(), '/tmp/kb-test');
    assert.strictEqual(resolveClippingDir(), '/tmp/kb-test/clippings');
    assert.strictEqual(resolveBaseOutputDir('repo'), '/tmp/kb-test/Documents');
  });

  test('resolves remote output paths when HOST_ENV=remote', () => {
    process.env.HOST_ENV = 'remote';
    delete process.env.KNOWLEDGE_ROOT;

    assert.strictEqual(resolveKnowledgeRoot(), '/srv/knowledge');
    assert.strictEqual(resolveBaseOutputDir('repo'), '/srv/knowledge/documentation');
    assert.strictEqual(resolveBaseOutputDir('list', 'awesome'), '/srv/knowledge/awesome');
    assert.strictEqual(resolveBaseOutputDir('list', 'usecases'), '/srv/knowledge/usecases');
    assert.strictEqual(resolveBaseOutputDir('clippings'), '/srv/knowledge/clippings');
    assert.strictEqual(resolveClippingDir(), '/srv/knowledge/clippings');
    assert.strictEqual(resolveBaseOutputDir('skills'), '/srv/knowledge/skills');
    assert.strictEqual(resolveSkillsDir(), '/srv/knowledge/skills');

    assert.strictEqual(resolveOutputDir('react', 'repo'), '/srv/knowledge/documentation/react');
    assert.strictEqual(resolveOutputDir('awesome-usecases', 'list', 'awesome'), '/srv/knowledge/awesome/awesome-usecases');
  });

  test('KNOWLEDGE_ROOT overrides clipping and skills destination', () => {
    delete process.env.HOST_ENV;
    process.env.KNOWLEDGE_ROOT = '/tmp/kb-test';
    assert.strictEqual(resolveClippingDir(), '/tmp/kb-test/clippings');
    assert.strictEqual(resolveSkillsDir(), '/tmp/kb-test/skills');
  });

  test('clipping and skills custom dir override wins', () => {
    assert.strictEqual(resolveClippingDir('./my-clips'), './my-clips');
    assert.strictEqual(resolveSkillsDir('./my-skills'), './my-skills');
  });
});
