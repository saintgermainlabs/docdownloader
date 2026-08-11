import assert from 'node:assert';
import { test, describe, after } from 'node:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parsePendingFile, convertYamlToJson } from '../src/scripts/processList';

describe('processList helpers', () => {
  const testDir = join(__dirname, 'mock_pending_data');
  const yamlPath = join(testDir, 'pending.yaml');
  const jsonPath = join(testDir, 'pending.json');

  after(() => {
    if (existsSync(testDir)) {
      try { rmSync(testDir, { recursive: true, force: true }); } catch {}
    }
  });

  test('parses YAML list of string URLs and converts to JSON', () => {
    mkdirSync(testDir, { recursive: true });
    const yamlContent = `
urls:
  - 'https://example.com/docs/v1'
  - 'https://example.com/docs/v2'
`;
    writeFileSync(yamlPath, yamlContent, 'utf-8');

    const items = parsePendingFile(yamlPath);
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].url, 'https://example.com/docs/v1');
    assert.strictEqual(items[1].url, 'https://example.com/docs/v2');

    convertYamlToJson(yamlPath, jsonPath);
    assert.ok(existsSync(jsonPath));

    const jsonItems = parsePendingFile(jsonPath);
    assert.strictEqual(jsonItems.length, 2);
    assert.strictEqual(jsonItems[0].url, 'https://example.com/docs/v1');
  });

  test('parses YAML list with custom item options', () => {
    const yamlContent = `
urls:
  - url: 'https://tailscale.com/docs'
    name: 'Tailscale'
    slug: 'tailscale'
    concurrency: 8
`;
    writeFileSync(yamlPath, yamlContent, 'utf-8');

    const items = parsePendingFile(yamlPath);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].url, 'https://tailscale.com/docs');
    assert.strictEqual(items[0].name, 'Tailscale');
    assert.strictEqual(items[0].concurrency, 8);
  });
});
