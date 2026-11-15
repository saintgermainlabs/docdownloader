import assert from 'node:assert';
import { test, describe } from 'node:test';
import { parseDetectArgs, formatReport, runDetect } from '../src/cli/detect';
import { Finding, Probe } from '../src/sources/types';

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
