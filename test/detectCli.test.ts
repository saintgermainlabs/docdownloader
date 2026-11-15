import assert from 'node:assert';
import { test, describe } from 'node:test';
import { parseDetectArgs, formatReport, runDetect, selectRunnable, normalizeInputUrl } from '../src/cli/detect';
import { Finding, Probe, SourceHandler, RunOptions } from '../src/sources/types';

const probe: Probe = {
  url: 'https://langfuse.com/docs',
  finalUrl: 'https://langfuse.com/docs',
  status: 200,
  frameworks: ['fumadocs'],
  fileLinks: [],
  needsBrowser: false,
  errors: {},
};

const f = (over: Partial<Finding>): Finding => ({
  handler: 'docs-site',
  kind: 'docs-site',
  url: probe.finalUrl,
  confidence: 0.9,
  summary: 'Fumadocs · sidebar tree found: 9 sections, 214 pages',
  command: 'doc-dl crawl https://langfuse.com/docs',
  runnable: true,
  ...over,
});

const findings: Finding[] = [
  f({}),
  f({ handler: 'site-index', kind: 'llms-txt', confidence: 0.3, summary: 'page index', command: '', runnable: false }),
];

function capture() {
  const lines: string[] = [];
  return { out: (s: string) => lines.push(s), text: () => lines.join('\n') };
}

describe('parseDetectArgs', () => {
  test('parses flags, --only list and passthrough', () => {
    const a = parseDetectArgs(['https://x', '--json', '--only', 'docs-site,skills', '-c', '5']);
    assert.strictEqual(a.url, 'https://x');
    assert.strictEqual(a.json, true);
    assert.strictEqual(a.run, false);
    assert.deepStrictEqual(a.only, ['docs-site', 'skills']);
    assert.deepStrictEqual(a.passthrough, ['-c', '5']);
    assert.strictEqual(a.layout, 'nav');
  });
  test('parses --run, --layout=url and --only=', () => {
    const a = parseDetectArgs(['--run', 'https://x', '--layout=url', '--only=readme']);
    assert.strictEqual(a.run, true);
    assert.strictEqual(a.layout, 'url');
    assert.deepStrictEqual(a.only, ['readme']);
  });
});

describe('normalizeInputUrl', () => {
  test('owner/repo shorthand becomes a GitHub URL', () => {
    assert.strictEqual(normalizeInputUrl('kepano/obsidian-skills'), 'https://github.com/kepano/obsidian-skills');
  });
  test('scheme-less hosts get https://', () => {
    assert.strictEqual(normalizeInputUrl('docs.example.com/guide'), 'https://docs.example.com/guide');
    assert.strictEqual(normalizeInputUrl('github.com/o/r'), 'https://github.com/o/r');
  });
  test('full URLs are unchanged', () => {
    assert.strictEqual(normalizeInputUrl('http://x.test/a'), 'http://x.test/a');
  });
});

describe('formatReport', () => {
  test('marks the recommended finding and info findings', () => {
    const text = formatReport(probe, findings);
    const lines = text.split('\n');
    const rec = lines.find((l) => l.includes('doc-dl crawl https://langfuse.com/docs'))!;
    assert.match(rec, /\[recommended\]/);
    assert.ok(lines.some((l) => l.startsWith('✔') && l.includes('Fumadocs')));
    assert.ok(lines.some((l) => l.startsWith('•') && l.includes('page index')));
    assert.strictEqual(lines[lines.length - 1], 'Run the recommended workflow:  doc-dl detect https://langfuse.com/docs --run');
  });
});

describe('runDetect', () => {
  test('--json prints parseable findings and exits 0', async () => {
    const c = capture();
    const code = await runDetect(['https://langfuse.com/docs', '--json'], {
      probe: async () => probe,
      detect: async () => findings,
      out: c.out,
    });
    assert.strictEqual(code, 0);
    const json = JSON.parse(c.text());
    assert.strictEqual(json.url, 'https://langfuse.com/docs');
    assert.strictEqual(json.findings.length, 2);
  });

  test('unreachable URL exits 1 with the error', async () => {
    const c = capture();
    const code = await runDetect(['https://down.test'], {
      probe: async () => { throw new Error('Cannot reach https://down.test: ENOTFOUND'); },
      detect: async () => [],
      out: c.out,
    });
    assert.strictEqual(code, 1);
    assert.match(c.text(), /Cannot reach https:\/\/down\.test/);
  });

  test('missing URL exits 1 with usage', async () => {
    const c = capture();
    assert.strictEqual(await runDetect([], { out: c.out }), 1);
    assert.match(c.text(), /USAGE/);
  });
});


describe('--run', () => {
  const docs = f({ handler: 'documents', kind: 'documents', confidence: 0.95, summary: '3 files — need Docling conversion', command: '', runnable: false });
  const site = f({});
  const info = f({ handler: 'site-index', kind: 'llms-txt', runnable: false, command: '' });
  const gh = (kind: any, runnable = kind !== 'wiki') => f({ handler: 'github', kind, url: 'https://github.com/o/r', confidence: 0.95, runnable });

  function fakeHandlers(seen: Array<{ kind: string; opts: RunOptions }>) {
    const h: SourceHandler = {
      id: 'x',
      detect: async () => [],
      run: async (finding, opts) => {
        seen.push({ kind: finding.kind, opts });
        return { outputDir: '/tmp/out', filesWritten: 2, warnings: [] };
      },
    };
    return () => h;
  }

  test('selectRunnable skips non-runnable top finding', () => {
    assert.deepStrictEqual(selectRunnable([docs, site]), [site]);
  });

  test('selectRunnable returns all GitHub sets, filtered by --only', () => {
    const all = [gh('doc-folder'), gh('readme'), gh('skills'), gh('wiki')];
    assert.deepStrictEqual(selectRunnable(all).map((x) => x.kind), ['doc-folder', 'readme', 'skills']);
    assert.deepStrictEqual(selectRunnable(all, ['skills']).map((x) => x.kind), ['skills']);
  });

  test('runs the best runnable finding and says why the top one was skipped', async () => {
    const seen: Array<{ kind: string; opts: RunOptions }> = [];
    const c = capture();
    const code = await runDetect(['https://langfuse.com/docs', '--run'], {
      probe: async () => probe,
      detect: async () => [docs, site],
      handler: fakeHandlers(seen),
      out: c.out,
    });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(seen.map((s) => s.kind), ['docs-site']);
    assert.match(c.text(), /needs Docling/);
  });

  test('nothing runnable exits 2', async () => {
    const c = capture();
    const code = await runDetect(['https://x.test', '--run'], {
      probe: async () => probe,
      detect: async () => [info],
      handler: fakeHandlers([]),
      out: c.out,
    });
    assert.strictEqual(code, 2);
  });

  test('passthrough options reach the handler', async () => {
    const seen: Array<{ kind: string; opts: RunOptions }> = [];
    await runDetect(['https://langfuse.com/docs', '--run', '-c', '5', '--force', '--layout', 'url', '-o', './o', '--db', './d.db'], {
      probe: async () => probe,
      detect: async () => [site],
      handler: fakeHandlers(seen),
      out: () => undefined,
    });
    assert.strictEqual(seen[0].opts.concurrency, 5);
    assert.strictEqual(seen[0].opts.force, true);
    assert.strictEqual(seen[0].opts.layout, 'url');
    assert.strictEqual(seen[0].opts.outputDir, './o');
    assert.strictEqual(seen[0].opts.dbPath, './d.db');
  });

  test('a failing run exits 1', async () => {
    const c = capture();
    const failing: SourceHandler = { id: 'x', detect: async () => [], run: async () => { throw new Error('boom'); } };
    const code = await runDetect(['https://langfuse.com/docs', '--run'], {
      probe: async () => probe,
      detect: async () => [site],
      handler: () => failing,
      out: c.out,
    });
    assert.strictEqual(code, 1);
    assert.match(c.text(), /boom/);
  });
});
