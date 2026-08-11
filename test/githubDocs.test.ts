import assert from 'node:assert';
import { test, describe } from 'node:test';
import { parseGithubUrl } from '../src/github_docs/githubApi';
import { parseGithubCliArgs } from '../src/github_docs/index';
import { extractTitleFromContent } from '../src/github_docs/downloader';

describe('github_docs module', () => {
  test('parses repo URLs correctly', () => {
    const info1 = parseGithubUrl('https://github.com/hesamsheikh/awesome-openclaw-usecases');
    assert.strictEqual(info1.owner, 'hesamsheikh');
    assert.strictEqual(info1.repo, 'awesome-openclaw-usecases');
    assert.strictEqual(info1.branch, undefined);
    assert.strictEqual(info1.treePath, undefined);

    const info2 = parseGithubUrl('https://github.com/hesamsheikh/awesome-openclaw-usecases/tree/main/usecases');
    assert.strictEqual(info2.owner, 'hesamsheikh');
    assert.strictEqual(info2.repo, 'awesome-openclaw-usecases');
    assert.strictEqual(info2.branch, 'main');
    assert.strictEqual(info2.treePath, 'usecases');
  });

  test('parses github-docs CLI flags', () => {
    const opts = parseGithubCliArgs([
      'https://github.com/hesamsheikh/awesome-openclaw-usecases',
      '--type=list',
      '--list-type=usecases',
      '--tree=usecases',
      '--readme=true'
    ]);
    assert.strictEqual(opts.repoUrl, 'https://github.com/hesamsheikh/awesome-openclaw-usecases');
    assert.strictEqual(opts.type, 'list');
    assert.strictEqual(opts.listType, 'usecases');
    assert.strictEqual(opts.tree, 'usecases');
    assert.strictEqual(opts.readme, true);
  });

  test('extracts title from Markdown content', () => {
    const title = extractTitleFromContent('# Awesome OpenClaw Usecases\nHello world', 'readme.md');
    assert.strictEqual(title, 'Awesome OpenClaw Usecases');
  });

  test('auto-detects awesome keyword in repo URL', () => {
    const url1 = 'https://github.com/aliaihub/awesome-hermes-usecases';
    const isAwesome1 = /awesome/i.test(url1);
    assert.strictEqual(isAwesome1, true);

    const url2 = 'https://github.com/facebook/react';
    const isAwesome2 = /awesome/i.test(url2);
    assert.strictEqual(isAwesome2, false);
  });
});
