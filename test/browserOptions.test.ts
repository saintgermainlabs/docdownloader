import assert from 'node:assert';
import { test, describe } from 'node:test';
import { browserLaunchOptions } from '../src/crawler/browser';

describe('browserLaunchOptions', () => {
  test('defaults to bundled headless Chromium', () => {
    const o = browserLaunchOptions({});
    assert.strictEqual(o.headless, true);
    assert.strictEqual(o.channel, undefined);
    assert.strictEqual(o.executablePath, undefined);
  });
  test('DOC_DL_BROWSER_CHANNEL selects an installed browser', () => {
    assert.strictEqual(browserLaunchOptions({ DOC_DL_BROWSER_CHANNEL: 'chrome' }).channel, 'chrome');
  });
  test('DOC_DL_CHROMIUM_PATH sets the executable', () => {
    assert.strictEqual(browserLaunchOptions({ DOC_DL_CHROMIUM_PATH: '/usr/bin/chromium' }).executablePath, '/usr/bin/chromium');
  });
});
