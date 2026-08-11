import assert from 'node:assert';
import { test, describe } from 'node:test';
import { getSubfolderPath, isUrlInScope, normalizeUrl } from '../src/crawler/urlUtils';

describe('urlUtils', () => {
  describe('getSubfolderPath', () => {
    test('extracts subfolder when trailing slash is present', () => {
      assert.strictEqual(getSubfolderPath('https://example.com/docs/v2/'), '/docs/v2/');
    });

    test('extracts parent directory when URL has file extension', () => {
      assert.strictEqual(getSubfolderPath('https://example.com/docs/v2/index.html'), '/docs/v2/');
      assert.strictEqual(getSubfolderPath('https://example.com/docs/v2/page.php'), '/docs/v2/');
    });

    test('returns path as is when no trailing slash or extension', () => {
      assert.strictEqual(getSubfolderPath('https://example.com/docs/v2'), '/docs/v2');
    });

    test('returns / for domain root', () => {
      assert.strictEqual(getSubfolderPath('https://example.com/'), '/');
      assert.strictEqual(getSubfolderPath('https://example.com'), '/');
    });
  });

  describe('isUrlInScope', () => {
    describe('subfolder scope', () => {
      const startUrl = 'https://example.com/docs/v2/';

      test('allows exact subfolder URL', () => {
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/', startUrl, 'subfolder'), true);
      });

      test('allows nested page inside subfolder', () => {
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/getting-started', startUrl, 'subfolder'), true);
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/api/ref', startUrl, 'subfolder'), true);
      });

      test('rejects pages outside subfolder', () => {
        assert.strictEqual(isUrlInScope('https://example.com/docs/v1/page', startUrl, 'subfolder'), false);
        assert.strictEqual(isUrlInScope('https://example.com/about', startUrl, 'subfolder'), false);
      });

      test('rejects different origin', () => {
        assert.strictEqual(isUrlInScope('https://other.com/docs/v2/page', startUrl, 'subfolder'), false);
      });

      test('handles subfolder startUrl without trailing slash', () => {
        const startNoSlash = 'https://example.com/docs/v2';
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2', startNoSlash, 'subfolder'), true);
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/', startNoSlash, 'subfolder'), true);
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/page', startNoSlash, 'subfolder'), true);
        // Sibling path starting with same prefix should be rejected
        assert.strictEqual(isUrlInScope('https://example.com/docs/v22/page', startNoSlash, 'subfolder'), false);
      });

      test('handles startUrl with index.html filename', () => {
        const startFile = 'https://example.com/docs/v2/index.html';
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/guide.html', startFile, 'subfolder'), true);
        assert.strictEqual(isUrlInScope('https://example.com/docs/index.html', startFile, 'subfolder'), false);
      });
    });

    describe('website scope', () => {
      const startUrl = 'https://example.com/docs/v2/';

      test('allows any page on same origin', () => {
        assert.strictEqual(isUrlInScope('https://example.com/docs/v2/page', startUrl, 'website'), true);
        assert.strictEqual(isUrlInScope('https://example.com/docs/v1/page', startUrl, 'website'), true);
        assert.strictEqual(isUrlInScope('https://example.com/about', startUrl, 'website'), true);
      });

      test('rejects different origin', () => {
        assert.strictEqual(isUrlInScope('https://other.com/about', startUrl, 'website'), false);
      });
    });
  });
});
