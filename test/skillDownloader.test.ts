import assert from 'node:assert';
import { test, describe, before, after, afterEach } from 'node:test';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  discoverSkillFiles,
  extractSkillTitle,
} from '../src/skills/downloader';
import { parseSkillCliArgs } from '../src/skills/index';
import { GithubFileEntry } from '../src/github_docs/types';
import { VisitedDatabase, computeHash } from '../src/storage/database';
import { resolveSkillsDir } from '../src/storage/paths';

describe('Skill Downloader Module', () => {
  const tempDir = join(__dirname, 'mock_skill_test_dir');
  const tempDbPath = join(tempDir, 'test_skills.db');
  const originalVaultEnv = process.env.OBSIDIAN_VAULT_PATH;
  const originalKnowledgeRoot = process.env.KNOWLEDGE_ROOT;
  const originalHostEnv = process.env.HOST_ENV;

  before(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  after(() => {
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  afterEach(() => {
    process.env.HOST_ENV = originalHostEnv;
    if (originalVaultEnv === undefined) {
      delete process.env.OBSIDIAN_VAULT_PATH;
    } else {
      process.env.OBSIDIAN_VAULT_PATH = originalVaultEnv;
    }
    if (originalKnowledgeRoot === undefined) {
      delete process.env.KNOWLEDGE_ROOT;
    } else {
      process.env.KNOWLEDGE_ROOT = originalKnowledgeRoot;
    }
  });

  describe('parseSkillCliArgs', () => {
    test('parses full URL and default options', async () => {
      const args = parseSkillCliArgs(['https://github.com/kepano/obsidian-skills']);
      assert.strictEqual(args.repoUrl, 'https://github.com/kepano/obsidian-skills');
      assert.strictEqual(args.force, false);
      assert.strictEqual(args.noDb, false);
      assert.strictEqual(args.dbPath, './docs.db');
      assert.strictEqual(args.help, false);
    });

    test('parses CLI flags correctly', async () => {
      const args = parseSkillCliArgs([
        'https://github.com/kepano/obsidian-skills',
        '--skill=json-canvas',
        '--tree=skills/json-canvas',
        '--out=/custom/skills/path',
        '--force',
        '--no-db',
        '--debug',
        '--name=My Custom Skills',
        '--slug=my-skills',
        '--db=/tmp/custom.db'
      ]);

      assert.strictEqual(args.repoUrl, 'https://github.com/kepano/obsidian-skills');
      assert.strictEqual(args.skillName, 'json-canvas');
      assert.strictEqual(args.tree, 'skills/json-canvas');
      assert.strictEqual(args.outputDir, '/custom/skills/path');
      assert.strictEqual(args.force, true);
      assert.strictEqual(args.noDb, true);
      assert.strictEqual(args.debug, true);
      assert.strictEqual(args.name, 'My Custom Skills');
      assert.strictEqual(args.slug, 'my-skills');
      assert.strictEqual(args.dbPath, '/tmp/custom.db');
    });

    test('handles shorthand flags and positional output directory', async () => {
      const args = parseSkillCliArgs([
        'kepano/obsidian-skills',
        '/tmp/positional-skills',
        '-s', 'defuddle',
        '-f',
        '-d'
      ]);

      assert.strictEqual(args.repoUrl, 'kepano/obsidian-skills');
      assert.strictEqual(args.outputDir, '/tmp/positional-skills');
      assert.strictEqual(args.skillName, 'defuddle');
      assert.strictEqual(args.force, true);
      assert.strictEqual(args.debug, true);
    });
  });

  describe('extractSkillTitle', () => {
    test('extracts title from YAML frontmatter title property', async () => {
      const markdown = `---
title: "JSON Canvas Visualization"
description: Build interactive diagrams
---
# JSON Canvas
`;
      assert.strictEqual(extractSkillTitle(markdown, 'SKILL.md'), 'JSON Canvas Visualization');
    });

    test('extracts name from YAML frontmatter name property', async () => {
      const markdown = `---
name: defuddle
description: Extract clean web content
---
Some body text without H1 header
`;
      assert.strictEqual(extractSkillTitle(markdown, 'SKILL.md'), 'defuddle');
    });

    test('extracts title from Markdown H1 header when no frontmatter', async () => {
      const markdown = `# Obsidian Markdown Syntax Guide\n\nDetailed reference for links and callouts.`;
      assert.strictEqual(extractSkillTitle(markdown, 'SKILL.md'), 'Obsidian Markdown Syntax Guide');
    });

    test('falls back to filename basename when no title or H1 found', async () => {
      const plain = `A basic document without headers or frontmatter.`;
      assert.strictEqual(extractSkillTitle(plain, 'CALLOUTS.md'), 'CALLOUTS');
    });
  });

  describe('discoverSkillFiles', () => {
    const mockObsidianSkillsRepoFiles: GithubFileEntry[] = [
      { name: 'marketplace.json', path: '.claude-plugin/marketplace.json', downloadUrl: 'http://example.com/1', type: 'file' },
      { name: 'plugin.json', path: '.claude-plugin/plugin.json', downloadUrl: 'http://example.com/2', type: 'file' },
      { name: 'LICENSE', path: 'LICENSE', downloadUrl: 'http://example.com/3', type: 'file' },
      { name: 'README.md', path: 'README.md', downloadUrl: 'http://example.com/4', type: 'file' },
      { name: 'SKILL.md', path: 'skills/defuddle/SKILL.md', downloadUrl: 'http://example.com/5', type: 'file' },
      { name: 'SKILL.md', path: 'skills/json-canvas/SKILL.md', downloadUrl: 'http://example.com/6', type: 'file' },
      { name: 'EXAMPLES.md', path: 'skills/json-canvas/references/EXAMPLES.md', downloadUrl: 'http://example.com/7', type: 'file' },
      { name: 'SKILL.md', path: 'skills/obsidian-bases/SKILL.md', downloadUrl: 'http://example.com/8', type: 'file' },
      { name: 'FUNCTIONS_REFERENCE.md', path: 'skills/obsidian-bases/references/FUNCTIONS_REFERENCE.md', downloadUrl: 'http://example.com/9', type: 'file' },
      { name: 'SKILL.md', path: 'skills/obsidian-cli/SKILL.md', downloadUrl: 'http://example.com/10', type: 'file' },
      { name: 'SKILL.md', path: 'skills/obsidian-markdown/SKILL.md', downloadUrl: 'http://example.com/11', type: 'file' },
      { name: 'CALLOUTS.md', path: 'skills/obsidian-markdown/references/CALLOUTS.md', downloadUrl: 'http://example.com/12', type: 'file' },
      { name: 'EMBEDS.md', path: 'skills/obsidian-markdown/references/EMBEDS.md', downloadUrl: 'http://example.com/13', type: 'file' },
      { name: 'PROPERTIES.md', path: 'skills/obsidian-markdown/references/PROPERTIES.md', downloadUrl: 'http://example.com/14', type: 'file' },
    ];

    test('discovers all skills in multi-skill repository with skills/ directory', async () => {
      const result = discoverSkillFiles(mockObsidianSkillsRepoFiles, {
        repoName: 'obsidian-skills'
      });

      assert.deepStrictEqual(result.skills.sort(), [
        'defuddle',
        'json-canvas',
        'obsidian-bases',
        'obsidian-cli',
        'obsidian-markdown'
      ].sort());

      assert.strictEqual(result.files.length, 10);

      // Verify target relative paths strip the leading 'skills/'
      const defuddleFile = result.files.find((f) => f.repoPath === 'skills/defuddle/SKILL.md');
      assert.ok(defuddleFile);
      assert.strictEqual(defuddleFile.targetRelativePath, 'defuddle/SKILL.md');
      assert.strictEqual(defuddleFile.skillName, 'defuddle');

      const jsonCanvasRef = result.files.find((f) => f.repoPath === 'skills/json-canvas/references/EXAMPLES.md');
      assert.ok(jsonCanvasRef);
      assert.strictEqual(jsonCanvasRef.targetRelativePath, 'json-canvas/references/EXAMPLES.md');
      assert.strictEqual(jsonCanvasRef.skillName, 'json-canvas');
    });

    test('filters to specific skill when skillName option is supplied', async () => {
      const result = discoverSkillFiles(mockObsidianSkillsRepoFiles, {
        repoName: 'obsidian-skills',
        skillName: 'json-canvas'
      });

      assert.deepStrictEqual(result.skills, ['json-canvas']);
      assert.strictEqual(result.files.length, 2);
      assert.ok(result.files.every((f) => f.skillName === 'json-canvas'));
      assert.ok(result.files.some((f) => f.targetRelativePath === 'json-canvas/SKILL.md'));
      assert.ok(result.files.some((f) => f.targetRelativePath === 'json-canvas/references/EXAMPLES.md'));
    });

    test('maps specific sub-tree path correctly', async () => {
      const result = discoverSkillFiles(mockObsidianSkillsRepoFiles, {
        repoName: 'obsidian-skills',
        tree: 'skills/obsidian-markdown'
      });

      assert.deepStrictEqual(result.skills, ['obsidian-markdown']);
      assert.strictEqual(result.files.length, 4);
      assert.ok(result.files.some((f) => f.targetRelativePath === 'obsidian-markdown/SKILL.md'));
      assert.ok(result.files.some((f) => f.targetRelativePath === 'obsidian-markdown/references/CALLOUTS.md'));
    });

    test('handles single-skill repository where SKILL.md is at root', async () => {
      const mockSingleSkillFiles: GithubFileEntry[] = [
        { name: 'SKILL.md', path: 'SKILL.md', downloadUrl: 'http://example.com/s1', type: 'file' },
        { name: 'helper.py', path: 'scripts/helper.py', downloadUrl: 'http://example.com/s2', type: 'file' },
        { name: 'README.md', path: 'README.md', downloadUrl: 'http://example.com/s3', type: 'file' }
      ];

      const result = discoverSkillFiles(mockSingleSkillFiles, {
        repoName: 'weather-agent-skill'
      });

      assert.deepStrictEqual(result.skills, ['weather-agent-skill']);
      assert.strictEqual(result.files.length, 3);
      assert.ok(result.files.some((f) => f.targetRelativePath === 'weather-agent-skill/SKILL.md'));
      assert.ok(result.files.some((f) => f.targetRelativePath === 'weather-agent-skill/scripts/helper.py'));
    });
  });

  describe('Storage & Database Integration', () => {
    test('records downloaded skills into SQLite index correctly', async () => {
      const db = new VisitedDatabase(tempDbPath);
      const sourceSlug = 'obsidian-skills';

      await db.recordSource({
        slug: sourceSlug,
        name: 'Obsidian Agent Skills',
        startUrl: 'https://github.com/kepano/obsidian-skills',
        description: 'Agent skills for Obsidian CLI and Markdown'
      });

      const skillFiles = [
        {
          url: 'https://github.com/kepano/obsidian-skills/blob/main/skills/defuddle/SKILL.md',
          path: 'skills/defuddle/SKILL.md',
          content: '---\nname: defuddle\n---\n# Defuddle Skill'
        },
        {
          url: 'https://github.com/kepano/obsidian-skills/blob/main/skills/json-canvas/SKILL.md',
          path: 'skills/json-canvas/SKILL.md',
          content: '---\nname: json-canvas\n---\n# JSON Canvas Skill'
        }
      ];

      for (const item of skillFiles) {
        const dest = join(tempDir, item.path);
        mkdirSync(join(dest, '..'), { recursive: true });
        writeFileSync(dest, item.content, 'utf-8');

        await db.recordVisited({
          url: item.url,
          sourceSlug,
          relativeFilePath: dest,
          title: extractSkillTitle(item.content, 'SKILL.md'),
          contentHash: computeHash(item.content)
        });
      }

      const source = await db.getSource(sourceSlug);
      assert.ok(source);
      assert.strictEqual(source.name, 'Obsidian Agent Skills');

      const visited = await db.getAllVisited(sourceSlug);
      assert.strictEqual(visited.length, 2);
      assert.strictEqual(visited[0].title, 'defuddle');
      assert.strictEqual(visited[1].title, 'json-canvas');

      assert.strictEqual(await db.hasVisited('https://github.com/kepano/obsidian-skills/blob/main/skills/defuddle/SKILL.md'), true);
      assert.strictEqual(await db.hasVisited('https://github.com/kepano/obsidian-skills/blob/main/skills/nonexistent.md'), false);

      await db.close();
    });
  });
});
