import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { normalizeSeparators } from '../layout';

const PUSH_CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

/** Decodes and concatenates the React Server Components payload chunks embedded in the HTML. */
export function decodeRscPayload(html: string): string {
  let out = '';
  for (const match of html.matchAll(PUSH_CHUNK)) {
    try {
      out += JSON.parse(match[1]);
    } catch {
      // skip malformed chunk
    }
  }
  return out;
}

/** Returns the balanced `{...}` / `[...]` substring starting at `start`, respecting JSON strings. */
export function sliceBalanced(text: string, start: number): string | undefined {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : undefined;
  if (!close) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '$undefined' ? value : undefined;
}

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).href;
  } catch {
    return undefined;
  }
}

function mapNodes(raw: unknown, base: string): NavNode[] {
  if (!Array.isArray(raw)) return [];
  const out: NavNode[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const node = item as Record<string, unknown>;
    const name = str(node.name) ?? '';
    switch (node.type) {
      case 'page':
      case 'link': {
        const url = absolute(str(node.url), base);
        if (url) out.push({ type: 'link', name, url });
        break;
      }
      case 'separator':
        out.push({ type: 'separator', name, children: [] });
        break;
      case 'folder': {
        const index = node.index as Record<string, unknown> | undefined;
        const url = absolute(str(index?.url), base);
        out.push({ type: 'folder', name, ...(url ? { url } : {}), children: mapNodes(node.children, base) });
        break;
      }
    }
  }
  return out;
}

function countLinks(nodes: NavNode[]): number {
  return nodes.reduce((n, node) => n + (node.type === 'link' ? 1 : countLinks(node.children)), 0);
}

/** Reads the Fumadocs page tree that Next.js embeds in every page's RSC payload. */
export const fumadocsExtractor: NavExtractor = {
  id: 'fumadocs',

  matches(input: ExtractInput): boolean {
    return !!input.html && input.html.includes('self.__next_f') && input.html.includes('\\"type\\":\\"root\\"');
  },

  async extract(input: ExtractInput): Promise<NavNode[]> {
    const payload = decodeRscPayload(input.html || '');
    const startPath = new URL(input.url).pathname.replace(/\/+$/, '');
    let best: NavNode[] = [];
    let bestScore = -1;

    let at = payload.indexOf('{"type":"root"');
    while (at !== -1) {
      const json = sliceBalanced(payload, at);
      if (json) {
        try {
          const nodes = normalizeSeparators(mapNodes(JSON.parse(json).children, input.url));
          // Prefer the tree that contains the start page; then the larger tree.
          const containsStart = json.includes(`"url":"${startPath}"`) ? 1_000_000 : 0;
          const score = containsStart + countLinks(nodes);
          if (score > bestScore) {
            best = nodes;
            bestScore = score;
          }
        } catch {
          // not valid JSON; ignore
        }
      }
      at = payload.indexOf('{"type":"root"', at + 1);
    }
    return best;
  },
};
