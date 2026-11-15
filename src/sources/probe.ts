import { Probe } from './types';

/** Minimal fetch signature used by the probe (injectable for tests). */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<{
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

const TIMEOUT_MS = 5000;
const HEADERS = { 'User-Agent': 'doc-dl' };
const FILE_EXT = /\.(pdf|docx?|pptx|xlsx|png|jpe?g|tiff?|webp)$/i;

const FRAMEWORK_MARKERS: Array<[string, (html: string) => boolean]> = [
  ['fumadocs', (h) => /fumadocs/i.test(h) || (h.includes('self.__next_f') && h.includes('\\"type\\":\\"root\\"'))],
  ['docusaurus', (h) => /<meta[^>]+generator[^>]+docusaurus/i.test(h) || h.includes('__docusaurus')],
  ['mintlify', (h) => /mintlify/i.test(h)],
  ['gitbook', (h) => /<meta[^>]+generator[^>]+gitbook/i.test(h) || /gitbook\.(io|com)\/.*\.(js|css)/i.test(h)],
  ['mkdocs', (h) => /<meta[^>]+generator[^>]+mkdocs/i.test(h)],
  ['nextra', (h) => /nextra/i.test(h)],
  ['sphinx', (h) => /<meta[^>]+generator[^>]+sphinx/i.test(h) || /_static\/(sphinx|doctools)/i.test(h)],
];

/** Lists docs-framework fingerprints found in a page's HTML. */
export function detectFrameworks(html: string): string[] {
  return FRAMEWORK_MARKERS.filter(([, test]) => test(html)).map(([id]) => id);
}

/** Finds links to document files (PDF, Office, images) and returns them as absolute URLs. */
export function findFileLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(m[1], baseUrl);
      if (FILE_EXT.test(url.pathname)) out.add(url.href);
    } catch {
      // ignore unparsable href
    }
  }
  return [...out];
}

function visibleTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

async function getText(fetchImpl: FetchLike, url: string) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: HEADERS });
  return { res, body: await res.text() };
}

/**
 * Probes a URL with plain HTTP: the page itself, `<origin>/llms.txt` and `<origin>/sitemap.xml`.
 *
 * @throws Error naming the URL when the page itself cannot be fetched.
 */
export async function probeUrl(url: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Probe> {
  let main;
  try {
    main = await getText(fetchImpl, url);
  } catch (error: any) {
    throw new Error(`Cannot reach ${url}: ${error?.message ?? error}`);
  }

  const finalUrl = main.res.url || url;
  const origin = new URL(finalUrl).origin;
  const contentType = main.res.headers.get('content-type') ?? undefined;
  const isHtml = !contentType || /html/i.test(contentType);
  const html = isHtml ? main.body : undefined;
  const errors: Record<string, string> = {};

  const [llms, sitemap] = await Promise.allSettled([
    getText(fetchImpl, `${origin}/llms.txt`),
    getText(fetchImpl, `${origin}/sitemap.xml`),
  ]);

  let llmsTxt: string | undefined;
  if (llms.status === 'fulfilled') {
    if (llms.value.res.status === 200 && !/^\s*</.test(llms.value.body)) llmsTxt = llms.value.body;
  } else {
    errors.llms = String(llms.reason?.message ?? llms.reason);
  }

  let sitemapUrls: string[] | undefined;
  if (sitemap.status === 'fulfilled') {
    if (sitemap.value.res.status === 200) {
      const locs = [...sitemap.value.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      if (locs.length) sitemapUrls = locs;
    }
  } else {
    errors.sitemap = String(sitemap.reason?.message ?? sitemap.reason);
  }

  const frameworks = html ? detectFrameworks(html) : [];
  return {
    url,
    finalUrl,
    status: main.res.status,
    contentType,
    html,
    llmsTxt,
    sitemapUrls,
    frameworks,
    fileLinks: html ? findFileLinks(html, finalUrl) : [],
    needsBrowser: !!html && frameworks.length === 0 && visibleTextLength(html) < 200,
    errors,
  };
}
