import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { normalizeSeparators } from '../layout';

const MAX_CLICKS = 500;
const MAX_MS = 60_000;
const ROOT_ATTR = 'data-ddl-sidebar';
const CLICKED_ATTR = 'data-ddl-clicked';

/**
 * Generic fallback: in a real browser page, finds the sidebar, opens every collapsed folder
 * (up to 500 clicks / 60 s) and reads the menu in DOM order. Non-link labels become
 * separators, buttons/summaries become folders, links become pages.
 */
export const domExpandExtractor: NavExtractor = {
  id: 'dom-expand',

  matches(input: ExtractInput): boolean {
    return !!input.page;
  },

  async extract(input: ExtractInput): Promise<NavNode[]> {
    const page = input.page;
    if (!page) return [];

    const found = await page.evaluate((attr: string) => {
      const linkCount = (el: Element) => el.querySelectorAll('a[href]').length;
      const candidates = Array.from(
        document.querySelectorAll('nav[aria-label*="sidebar" i], aside nav, aside, nav')
      ).filter((el) => linkCount(el) > 0);
      if (!candidates.length) return false;
      const preferred =
        candidates.find((el) => el.matches('nav[aria-label*="sidebar" i]')) ||
        candidates.find((el) => el.matches('aside nav')) ||
        candidates.find((el) => el.matches('aside')) ||
        candidates.sort((a, b) => linkCount(b) - linkCount(a))[0];
      preferred.setAttribute(attr, '1');
      return true;
    }, ROOT_ATTR);
    if (!found) return [];

    // Open collapsed folders until none are left (or the caps are hit).
    const started = Date.now();
    for (let clicks = 0; clicks < MAX_CLICKS && Date.now() - started < MAX_MS; clicks++) {
      const selector = `[${ROOT_ATTR}] [aria-expanded="false"]:not([${CLICKED_ATTR}])`;
      const next = await page.$(selector);
      if (!next) {
        const openedDetails = await page.evaluate((attr: string) => {
          const closed = Array.from(document.querySelectorAll(`[${attr}] details:not([open])`));
          closed.forEach((d) => d.setAttribute('open', ''));
          return closed.length;
        }, ROOT_ATTR);
        if (!openedDetails) break;
        continue;
      }
      await next.evaluate((el: Element, attr: string) => el.setAttribute(attr, '1'), CLICKED_ATTR);
      await next.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(60);
    }

    const raw = await page.evaluate((attr: string) => {
      type Raw = { type: 'separator' | 'folder' | 'link'; name: string; url?: string; children?: Raw[] };
      const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const isHeader = (el: Element) => el.matches('button, summary, [aria-expanded]') && !el.matches('a');
      const isLabel = (el: Element) =>
        !el.querySelector('a[href], button, summary') && !el.matches('a, button, summary, script, style, svg') &&
        text(el).length > 0 && text(el).length <= 80;

      const walkNodes = (elements: Element[]): Raw[] => {
        const out: Raw[] = [];
        for (const child of elements) {
          if (child.matches('a[href]')) {
            out.push({ type: 'link', name: text(child), url: (child as HTMLAnchorElement).href });
            continue;
          }
          const first = child.firstElementChild;
          if (first && isHeader(first)) {
            const link = first.querySelector('a[href]') as HTMLAnchorElement | null;
            const children = walkNodes(Array.from(child.children).slice(1));
            out.push({ type: 'folder', name: text(first), ...(link ? { url: link.href } : {}), children });
            continue;
          }
          if (isHeader(child)) continue;
          if (isLabel(child)) {
            out.push({ type: 'separator', name: text(child), children: [] });
            continue;
          }
          out.push(...walkNodes(Array.from(child.children)));
        }
        return out;
      };

      const root = document.querySelector(`[${attr}]`);
      return root ? walkNodes(Array.from(root.children)) : [];
    }, ROOT_ATTR);

    return normalizeSeparators(raw as NavNode[]);
  },
};
