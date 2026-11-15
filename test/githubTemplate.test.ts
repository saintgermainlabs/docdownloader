import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepo, createGithubTemplate, GithubDeps } from '../src/sources/templates/github';
import { parseGitTreeResponse } from '../src/github_docs/githubApi';
import { parseGithubUrl } from '../src/github_docs/githubApi';
import { Finding, Probe } from '../src/sources/types';

const treeJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'github-tree.json'), 'utf-8'));

function deps(over: Partial<GithubDeps> = {}, calls: string[] = []): GithubDeps {
  return {
    meta: async () => ({ defaultBranch: 'main', description: 'demo' }),
    tree: async (ref: string) => {
      calls.push(ref);
      return parseGitTreeResponse(treeJson, 'o', 'r', ref);
    },
    fetchText: async (url: string) => {
      if (url.endsWith('/mkdocs.yml')) return 'nav:\n  - Home: index.md\n  - Guide:\n      - Install: guide/install.md\n';
      return `# ${url.split('/').pop()}`;
    },
    ...over,
  };
}

const byKind = (fs: Finding[], kind: string) => fs.filter((f) => f.kind === kind);

describe('GitHub template scan', () => {
  test('one finding per documentation set', async () => {
    const fs = await scanRepo(parseGithubUrl('https://github.com/o/r'), deps());
    const folder = byKind(fs, 'doc-folder');
    assert.strictEqual(folder.length, 1);
    assert.strictEqual(folder[0].details?.folder, 'docs');
    assert.strictEqual(folder[0].details?.navConfig, 'mkdocs');
    assert.strictEqual(byKind(fs, 'readme').length, 1);
    assert.strictEqual(byKind(fs, 'skills').length, 1);
    const docs = byKind(fs, 'documents');
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].runnable, false);
    assert.deepStrictEqual(docs[0].details?.files, ['docs/spec.pdf']);
    const wiki = byKind(fs, 'wiki');
    assert.strictEqual(wiki[0].runnable, false);
    assert.strictEqual(wiki[0].url, 'https://deepwiki.com/o/r');
    for (const f of fs) assert.strictEqual(f.confidence, 0.95);
    assert.strictEqual(fs.find((f) => f.runnable)?.kind, 'doc-folder', 'doc folders are recommended first');
  });

  test('nested READMEs: only from folders without other docs', async () => {
    const fs = await scanRepo(parseGithubUrl('https://github.com/o/r'), deps());
    assert.deepStrictEqual(byKind(fs, 'readme')[0].details?.files, ['README.md', 'examples/README.md']);
  });

  test('homepage becomes a docs-site suggestion', async () => {
    const fs = await scanRepo(
      parseGithubUrl('https://github.com/o/r'),
      deps({ meta: async () => ({ defaultBranch: 'main', description: '', homepage: 'https://r.dev/docs' }) })
    );
    const site = byKind(fs, 'docs-site')[0];
    assert.strictEqual(site.runnable, false);
    assert.strictEqual(site.command, 'doc-dl detect https://r.dev/docs');
  });

  test('/tree/<ref>/<path> limits the scan and uses the ref', async () => {
    const calls: string[] = [];
    const fs = await scanRepo(parseGithubUrl('https://github.com/o/r/tree/v2/docs'), deps({}, calls));
    assert.deepStrictEqual(calls, ['v2']);
    assert.strictEqual(byKind(fs, 'skills').length, 0);
    assert.strictEqual(byKind(fs, 'doc-folder').length, 1);
    assert.deepStrictEqual(byKind(fs, 'readme')[0]?.details?.files, ['docs/README.md']);
  });

  test('truncated tree adds a warning', async () => {
    const fs = await scanRepo(
      parseGithubUrl('https://github.com/o/r'),
      deps({ tree: async (ref) => ({ ...parseGitTreeResponse(treeJson, 'o', 'r', ref), truncated: true }) })
    );
    const w = byKind(fs, 'warning');
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0].runnable, false);
    assert.match(w[0].summary, /incomplete/);
  });

  test('rate-limited tree yields a GITHUB_TOKEN hint instead of throwing', async () => {
    const fs = await scanRepo(
      parseGithubUrl('https://github.com/o/r'),
      deps({ tree: async () => { throw new Error('GitHub API 403: API rate limit exceeded'); } })
    );
    assert.strictEqual(fs.length, 1);
    assert.strictEqual(fs[0].kind, 'warning');
    assert.match(fs[0].summary, /GITHUB_TOKEN/);
  });
});

describe('GitHub template detect/run', () => {
  const probe = (url: string): Probe => ({
    url, finalUrl: url, status: 200, frameworks: [], fileLinks: [], needsBrowser: false, errors: {},
  });

  test('only matches github.com URLs', async () => {
    const t = createGithubTemplate(deps());
    assert.deepStrictEqual(await t.detect(probe('https://langfuse.com/docs/x')), []);
    assert.ok((await t.detect(probe('https://github.com/o/r'))).length > 0);
  });

  test('running a doc-folder with mkdocs writes numbered paths and _tree.json', async () => {
    const t = createGithubTemplate(deps());
    const folder = (await t.detect(probe('https://github.com/o/r'))).find((f) => f.kind === 'doc-folder')!;
    const out = mkdtempSync(join(tmpdir(), 'ddl-gh-'));
    const res = await t.run!(folder, { outputDir: out, dbPath: join(out, 't.db') });
    assert.ok(existsSync(join(out, 'docs', '01-home.md')));
    assert.ok(existsSync(join(out, 'docs', '02-guide', '01-install.md')));
    assert.ok(existsSync(join(out, 'docs', '_tree.json')));
    assert.ok(existsSync(join(out, 'docs', '_unlisted', 'README.md')));
    assert.ok(res.filesWritten >= 3);
  });

  test('a file that fails to download becomes a warning, others still saved', async () => {
    const t = createGithubTemplate(
      deps({
        fetchText: async (url: string) => {
          if (url.endsWith('/mkdocs.yml')) return 'nav:\n  - Home: index.md\n  - Guide:\n      - Install: guide/install.md\n';
          if (url.endsWith('/install.md')) throw new Error('status: 404');
          return '# ok';
        },
      })
    );
    const folder = (await t.detect(probe('https://github.com/o/r'))).find((f) => f.kind === 'doc-folder')!;
    const out = mkdtempSync(join(tmpdir(), 'ddl-gh-'));
    const res = await t.run!(folder, { outputDir: out, dbPath: join(out, 't.db') });
    assert.ok(existsSync(join(out, 'docs', '01-home.md')));
    assert.ok(res.warnings.some((w) => w.includes('docs/guide/install.md')));
  });

  test('running a readme finding mirrors README paths', async () => {
    const t = createGithubTemplate(deps());
    const readme = (await t.detect(probe('https://github.com/o/r'))).find((f) => f.kind === 'readme')!;
    const out = mkdtempSync(join(tmpdir(), 'ddl-gh-'));
    await t.run!(readme, { outputDir: out, dbPath: join(out, 't.db') });
    assert.ok(existsSync(join(out, 'README.md')));
    assert.ok(existsSync(join(out, 'examples', 'README.md')));
  });
});
