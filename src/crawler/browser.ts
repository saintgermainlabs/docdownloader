import { chromium, Browser, Page } from 'playwright';

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
export class BrowserManager {
  private browser: Browser | null = null;

  /**
   * Initializes the headless Chromium browser instance.
   *
   * @returns A promise that resolves when Chromium launch completes.
   */
  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
  }

  /**
   * Spawns a new isolated browser context and page.
   *
   * @throws {Error} Thrown if called before `init()` completes.
   * @returns A promise resolving to a new Playwright {@link Page}.
   */
  async newPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not initialized');
    const context = await this.browser.newContext();
    return context.newPage();
  }

  /**
   * Closes the underlying browser instance and frees resources.
   *
   * @returns A promise that resolves when closing finishes.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}