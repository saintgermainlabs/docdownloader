import type { Page } from 'playwright';
import { NavNode } from './types';

/** Input handed to nav extractors: a rendered page and/or its HTML, or a repo's files. */
export interface ExtractInput {
  html?: string;
  page?: Page;
  /** URL of the page (used to resolve relative links), or the repo URL. */
  url: string;
  /** Repo path → file content, for extractors that read sidebar config files. */
  repoFiles?: Map<string, string>;
  /** Repo path of the sidebar config to read, when a repo has several. */
  configPath?: string;
}

/** Turns a page or repo config into a sidebar tree. */
export interface NavExtractor {
  id: string;
  matches(input: ExtractInput): boolean;
  extract(input: ExtractInput): Promise<NavNode[]>;
}

const extractors: NavExtractor[] = [];

/** Registers an extractor; extractors are tried in registration order. */
export function registerExtractor(extractor: NavExtractor): void {
  if (!extractors.some((e) => e.id === extractor.id)) {
    extractors.push(extractor);
  }
}

/** Returns a registered extractor by id (built-ins are loaded on first use). */
export function getExtractor(id: string): NavExtractor | undefined {
  ensureBuiltins();
  return extractors.find((e) => e.id === id);
}

/** Lists registered extractors in order. */
export function listExtractors(): readonly NavExtractor[] {
  return extractors;
}

/**
 * Tries matching extractors in order and returns the first non-empty tree.
 * Extractor errors are swallowed so the next one can try.
 */
export async function extractNav(
  input: ExtractInput
): Promise<{ framework: string; nodes: NavNode[] } | null> {
  ensureBuiltins();
  for (const extractor of extractors) {
    let matched = false;
    try {
      matched = extractor.matches(input);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    try {
      const nodes = await extractor.extract(input);
      if (nodes.length > 0) return { framework: extractor.id, nodes };
    } catch {
      // fall through to the next extractor
    }
  }
  return null;
}

let builtinsLoaded = false;
function ensureBuiltins(): void {
  if (builtinsLoaded) return;
  builtinsLoaded = true;
  // Loaded lazily to avoid circular imports (extractors import this module's types).
  require('./extractors');
}
