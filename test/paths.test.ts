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

  test('resolves local Obsidian vault paths by default', () => {
    delete process.env.HOST_ENV;
    delete process.env.KNOWLEDGE_ROOT;
    delete process.env.OBSIDIAN_VAULT_PATH;

    const root = resolveKnowledgeRoot();
    assert.ok(
      root === '/home/god/obsidian-vaults/agent/second-brain' ||
      root === '/home/god/projects/knowledge'
    );
    assert.strictEqual(resolveBaseOutputDir('clippings'), `${root}/clippings`);
    assert.strictEqual(resolveClippingDir(), `${root}/clippings`);
    assert.strictEqual(resolveBaseOutputDir('skills'), `${root}/skills`);
    assert.strictEqual(resolveSkillsDir(), `${root}/skills`);
    assert.ok(
      resolveBaseOutputDir('repo').endsWith('Documentation') ||
      resolveBaseOutputDir('repo').endsWith('Documents') ||
      resolveBaseOutputDir('repo') === './output'
    );
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
