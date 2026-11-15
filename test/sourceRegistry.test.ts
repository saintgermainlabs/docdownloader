import assert from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerHandler, detectAll, resetRegistry, getHandler } from '../src/sources/registry';
import { registerBuiltinHandlers } from '../src/sources/handlers';
import { createDocsSiteHandler } from '../src/sources/handlers/docsSite';
import { Probe, SourceHandler, Finding } from '../src/sources/types';

const langfuse = readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'langfuse-docs.html'), 'utf-8');

function probe(over: Partial<Probe> = {}): Probe {
  return {
    url: 'https://s.test/',
    finalUrl: 'https://s.test/',
    status: 200,
    html: '<p>hello</p>',
    frameworks: [],
    fileLinks: [],
    needsBrowser: false,
    errors: {},
    ...over,
  };
}

const fixed = (id: string, confidence: number): SourceHandler => ({
  id,
  detect: async (p): Promise<Finding[]> => [
    { handler: id, kind: 'docs-site', url: p.finalUrl, confidence, summary: id, command: id, runnable: true },
  ],
});

describe('source registry', () => {
  beforeEach(() => resetRegistry());

  test('Langfuse probe: docs-site first, plus llms.txt and documents findings', async () => {
    registerBuiltinHandlers();
    const findings = await detectAll(
      probe({
        url: 'https://langfuse.com/docs',
        finalUrl: 'https://langfuse.com/docs',
        html: langfuse,
        frameworks: ['fumadocs'],
        llmsTxt: '# Langfuse\n- [Docs](https://langfuse.com/docs)',
        fileLinks: ['https://langfuse.com/whitepaper.pdf'],
      })
    );
    assert.strictEqual(findings[0].kind, 'docs-site');
    assert.strictEqual(findings[0].details?.framework, 'fumadocs');
    assert.ok((findings[0].details?.pages as number) > 0);
    assert.strictEqual(findings[0].command, 'doc-dl crawl https://langfuse.com/docs');
    assert.ok(findings.some((f) => f.kind === 'llms-txt' && !f.runnable));
    const docs = findings.find((f) => f.kind === 'documents');
    assert.ok(docs && docs.runnable === false && /need Docling conversion/.test(docs.summary));
  });

  test('bare page yields only the single-page fallback', async () => {
    registerBuiltinHandlers();
    const findings = await detectAll(probe());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].kind, 'page');
    assert.strictEqual(findings[0].runnable, true);
    assert.strictEqual(findings[0].confidence, 0.1);
  });

  test('templates win ties against generic handlers', async () => {
    registerHandler(fixed('generic', 0.9));
    registerHandler(fixed('template', 0.9), { template: true });
    const findings = await detectAll(probe());
    assert.strictEqual(findings[0].handler, 'template');
    assert.ok(getHandler('generic'));
  });

  test('a handler that throws does not break detection', async () => {
    registerBuiltinHandlers();
    registerHandler({ id: 'boom', detect: async () => { throw new Error('boom'); } });
    const findings = await detectAll(probe());
    assert.strictEqual(findings[0].kind, 'page');
  });

  test('needsBrowser triggers exactly one render', async () => {
    let renders = 0;
    registerHandler(createDocsSiteHandler({ render: async () => { renders++; return langfuse; } }));
    const findings = await detectAll(
      probe({ url: 'https://langfuse.com/docs', finalUrl: 'https://langfuse.com/docs', html: '<div id="root"></div>', needsBrowser: true })
    );
    assert.strictEqual(renders, 1);
    assert.strictEqual(findings[0].details?.framework, 'fumadocs');
  });

  test('no render when the page is already rich', async () => {
    let renders = 0;
    registerHandler(createDocsSiteHandler({ render: async () => { renders++; return ''; } }));
    await detectAll(probe({ html: langfuse, frameworks: ['fumadocs'], url: 'https://langfuse.com/docs', finalUrl: 'https://langfuse.com/docs' }));
    assert.strictEqual(renders, 0);
  });
});
