/**
 * Result of a cheap HTTP probe of a URL (no browser).
 */
export interface Probe {
  url: string;
  /** URL after redirects. */
  finalUrl: string;
  status?: number;
  contentType?: string;
  html?: string;
  llmsTxt?: string;
  sitemapUrls?: string[];
  /** True when sitemap.xml is a sitemap index (its URLs are nested sitemaps, not pages). */
  sitemapIsIndex?: boolean;
  /** Docs framework fingerprints found in the HTML (e.g. `fumadocs`, `docusaurus`). */
  frameworks: string[];
  /** Linked document files (PDF, Office, images) as absolute URLs. */
  fileLinks: string[];
  /** True when the page appears to render only with JavaScript. */
  needsBrowser: boolean;
  /** Per-request failures, keyed by `main`, `llms`, `sitemap`. */
  errors: Record<string, string>;
}

/** Kinds of things `detect` can report. */
export type FindingKind =
  | 'docs-site'
  | 'readme'
  | 'doc-folder'
  | 'skills'
  | 'wiki'
  | 'documents'
  | 'page'
  | 'llms-txt'
  | 'sitemap'
  | 'warning';

/** One downloadable (or informational) source found at a URL. */
export interface Finding {
  /** Handler id, e.g. `docs-site`, `github`, `deepwiki`. */
  handler: string;
  kind: FindingKind;
  url: string;
  /** 0..1 */
  confidence: number;
  /** One line for the report. */
  summary: string;
  /** Exact CLI command that downloads it. */
  command: string;
  /** False for "needs Docling" and info-only findings. */
  runnable: boolean;
  details?: Record<string, unknown>;
}

/** Options passed to a handler's `run`. */
export interface RunOptions {
  outputDir?: string;
  dbPath?: string;
  force?: boolean;
  concurrency?: number;
  layout?: 'nav' | 'url';
  only?: string[];
  debug?: boolean;
}

/** Outcome of running a finding. */
export interface RunResult {
  outputDir: string;
  filesWritten: number;
  warnings: string[];
}

/** Recognises a kind of source and knows how to download it. */
export interface SourceHandler {
  id: string;
  detect(probe: Probe): Promise<Finding[]>;
  run?(finding: Finding, opts: RunOptions): Promise<RunResult>;
}
