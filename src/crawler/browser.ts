import { chromium, Browser, Page, LaunchOptions } from 'playwright';
import { logger } from '../utils/logger';

/**
 * Manages Playwright headless browser instances and context lifecycle.
 *
 * @remarks
 * Provides thread-safe creation of new browser pages for parallel scraping.
 *
 * @example
 * ```typescript
 * const manager = new BrowserManager();
 * await manager.init();
 * const page = await manager.newPage();
 * await page.goto('https://example.com');
 * await manager.close();
 * ```
 */
/**
 * Chromium launch options. By default Playwright's bundled Chromium is used; set
 * `DOC_DL_BROWSER_CHANNEL` (e.g. `chrome`) or `DOC_DL_CHROMIUM_PATH` to use an installed browser.
 */
export function browserLaunchOptions(env: NodeJS.ProcessEnv = process.env): LaunchOptions {
  return {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    ...(env.DOC_DL_BROWSER_CHANNEL ? { channel: env.DOC_DL_BROWSER_CHANNEL } : {}),
    ...(env.DOC_DL_CHROMIUM_PATH ? { executablePath: env.DOC_DL_CHROMIUM_PATH } : {}),
  };
}

export class BrowserManager {
  private browser: Browser | null = null;

  /**
   * Initializes the headless Chromium browser instance.
   *
   * @returns A promise that resolves when Chromium launch completes.
   */
  async init(): Promise<void> {
    logger.debug('BROWSER', 'Launching Playwright Chromium browser (headless: true)...');
    const start = Date.now();
    try {
      this.browser = await chromium.launch(browserLaunchOptions());
      const elapsed = Date.now() - start;
      logger.debug('BROWSER', `Chromium launched successfully in ${elapsed}ms (version: ${this.browser.version()})`);
    } catch (err: any) {
      logger.error('BROWSER', `Failed to launch Chromium browser: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Spawns a new isolated browser context and page.
   *
   * @throws {Error} Thrown if called before `init()` completes.
   * @returns A promise resolving to a new Playwright {@link Page}.
   */
  async newPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not initialized');
    logger.debug('BROWSER', 'Creating new isolated browser context and page tab...');
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      bypassCSP: true,
      ignoreHTTPSErrors: true
    });
    return context.newPage();
  }

  /**
   * Closes the underlying browser instance and frees resources.
   *
   * @returns A promise that resolves when closing finishes.
   */
  async close(): Promise<void> {
    if (this.browser) {
      logger.debug('BROWSER', 'Closing Chromium browser instance...');
      await this.browser.close();
      this.browser = null;
      logger.debug('BROWSER', 'Chromium browser instance closed.');
    }
  }
}