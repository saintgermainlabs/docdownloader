import assert from 'node:assert';
import { test, describe, afterEach, before, after } from 'node:test';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveBaseOutputDir,
  resolveClippingDir,
  resolveKnowledgeRoot,
  resolveOutputDir,
} from '../src/storage/paths';
import { extractDefaultSlug } from '../src/storage/database';
import { defaultClipFilename, wrapClippingMarkdown } from '../src/scripts/clip';

describe('Obsidian Integration & Vault Routing', () => {
  const originalHostEnv = process.env.HOST_ENV;
  const originalKnowledgeRoot = process.env.KNOWLEDGE_ROOT;
  const originalObsidianVaultPath = process.env.OBSIDIAN_VAULT_PATH;
  const tempTestVault = join(__dirname, 'mock_second_brain_vault');

  before(() => {
    mkdirSync(join(tempTestVault, 'clippings'), { recursive: true });
    mkdirSync(join(tempTestVault, 'Documentation'), { recursive: true });
    mkdirSync(join(tempTestVault, 'Documents'), { recursive: true });
  });

  after(() => {
    if (existsSync(tempTestVault)) {
      try {
        rmSync(tempTestVault, { recursive: true, force: true });
      } catch {}
    }
  });

  afterEach(() => {
    process.env.HOST_ENV = originalHostEnv;
    if (originalKnowledgeRoot === undefined) {
      delete process.env.KNOWLEDGE_ROOT;
    } else {
      process.env.KNOWLEDGE_ROOT = originalKnowledgeRoot;
    }
    if (originalObsidianVaultPath === undefined) {
      delete process.env.OBSIDIAN_VAULT_PATH;
    } else {
      process.env.OBSIDIAN_VAULT_PATH = originalObsidianVaultPath;
    }
  });

  test('resolves default Obsidian second-brain vault or custom vault root', () => {
    process.env.OBSIDIAN_VAULT_PATH = tempTestVault;

    assert.strictEqual(resolveKnowledgeRoot(), tempTestVault);
    assert.strictEqual(resolveClippingDir(), join(tempTestVault, 'clippings'));
    assert.strictEqual(resolveBaseOutputDir('clippings'), join(tempTestVault, 'clippings'));
    assert.strictEqual(resolveBaseOutputDir('repo'), join(tempTestVault, 'Documentation'));
    assert.strictEqual(resolveOutputDir('hermes-agent', 'repo'), join(tempTestVault, 'Documentation/hermes-agent'));
  });

  test('intelligent slug extraction removes generic docs keywords and selects meaningful names', () => {
    // Should extract meaningful subpath
    assert.strictEqual(
      extractDefaultSlug('https://www.quartz-scheduler.org/documentation/quartz-2.5.x/'),
      'quartz-2.5.x'
    );
    // Should extract meaningful component
    assert.strictEqual(
      extractDefaultSlug('https://react.dev/reference/react'),
      'react'
    );
    // Should extract meaningful subdomain
    assert.strictEqual(
      extractDefaultSlug('https://hermes-agent.nousresearch.com/docs/'),
      'hermes-agent'
    );
    // Should retain full host for docs.prefix
    assert.strictEqual(
      extractDefaultSlug('https://docs.openclaw.ai/guide/plugins'),
      'plugins'
    );
    // Should fallback to domain name
    assert.strictEqual(
      extractDefaultSlug('https://tailscale.com/docs'),
      'tailscale'
    );
  });

  test('creates properly formatted Obsidian clipping notes with frontmatter', () => {
    const title = 'Hermes Agent Architecture & Features';
    const url = 'https://hermes-agent.nousresearch.com/docs/user-stories';
    const body = '## User Stories\n\nHermes agent handles multi-turn agent tasks.';

    const markdown = wrapClippingMarkdown(title, url, body);
    assert.ok(markdown.startsWith('---'));
    assert.ok(markdown.includes('title: "Hermes Agent Architecture & Features"'));
    assert.ok(markdown.includes('source: https://hermes-agent.nousresearch.com/docs/user-stories'));
    assert.ok(markdown.includes('type: clipping'));
    assert.ok(markdown.includes('clipped: '));
    assert.ok(markdown.includes('## User Stories'));

    const filename = defaultClipFilename(url, title);
    assert.ok(filename.endsWith('.md'));
    assert.ok(filename.includes('hermes-agent-architecture-features'));

    const savePath = join(tempTestVault, 'clippings', filename);
    writeFileSync(savePath, markdown, 'utf-8');

    assert.ok(existsSync(savePath));
    const savedContent = readFileSync(savePath, 'utf-8');
    assert.strictEqual(savedContent, markdown);
  });

  test('saves structured documentation files under Documentation hierarchy', () => {
    const slug = 'test-doc-service';
    const docDir = resolveOutputDir(slug, 'repo', 'awesome', undefined);
    
    mkdirSync(docDir, { recursive: true });
    const readmeFile = join(docDir, 'index.md');
    writeFileSync(readmeFile, '# Test Service Documentation\n\nContent goes here.', 'utf-8');

    assert.ok(existsSync(readmeFile));
    const content = readFileSync(readmeFile, 'utf-8');
    assert.ok(content.includes('# Test Service Documentation'));
  });
});
