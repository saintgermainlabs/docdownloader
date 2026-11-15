# Design: `detect`, sidebar-aware crawling, and provider templates

- **Date:** 2026-11-15
- **Status:** Draft for review
- **Scope:** Doc-DL core (`src/`), wrapper CLIs (`bin/`)

## 1. Goal

Give Doc-DL one entry point that looks at any URL, works out what documentation is available there, and tells you (or runs) the right workflow. When it downloads a documentation site, it must keep the site's **sidebar tree**: its non-clickable categories, nested folders and page order. URL paths don't capture that tree.

### What the user asked for

- A `detect` command: scan a URL, report what kinds of documents exist, and give the workflow that downloads them.
- PDFs, Office files and images are flagged as needing Docling conversion, even though v1 can't convert them.
- `detect` reports by default, `--json` gives machine-readable output for agents, and `--run` executes the recommended workflow. `ddocs <url>` uses `detect` instead of URL pattern matching.
- Downloads keep the sidebar tree, with categories (e.g. Langfuse's "Get Started with"), subfolders ("Prompt & Skill Management") and pages, in sidebar order.
- Sidebar layout is the default when a tree is found, and order is kept with number prefixes.
- **Templates** for standard documentation providers: DeepWiki (fixed structure) and GitHub (scanned first, because a repo can contain several documentation sets).
- For a GitHub repo with several documentation sets, `--run` downloads all of them, each in its own subfolder.

### Assumptions (not stated by the user)

- The plugin/registry structure is internal for now. External plugin packages come later.
- Docling conversion and docling-context ingestion are out of scope for v1. The design leaves room for them as handlers.

### Success criteria

1. `detect https://langfuse.com/docs` reports a Fumadocs docs site with its sidebar tree, plus `llms.txt` and `sitemap.xml`, in under ~10 s and without starting a browser.
2. `crawl https://langfuse.com/docs` writes `02-get-started-with/01-tracing.md` and `02-get-started-with/02-prompt-and-skill-management/{01-prompt-management,02-skill-management}.md` (numbers as per the live sidebar), plus `_tree.json`.
3. `detect https://github.com/<repo-with-mkdocs>` reports README, `docs/` (with its `mkdocs.yml` sidebar tree) and any skills folder as separate findings. `--run` downloads all of them into subfolders.
4. `detect https://deepwiki.com/<owner>/<repo>` uses the DeepWiki MCP server, and `--run` writes the wiki in its topic order.
5. Existing commands (`crawl --layout url`, `github-docs`, `skill`, `clip`, `process-list`, `import-docs`) behave as before. All existing tests pass.

### Non-goals (v1)

- Converting PDF/Office/image files (Docling) or ingesting into docling-context.
- Running arbitrary JavaScript from repos (e.g. dynamic Docusaurus `sidebars.js`).
- Interactive pickers.
- Templates beyond DeepWiki and GitHub (Read the Docs, docs.rs and others follow the same interface later).

## 2. Background

- The crawler saves pages by URL path (`FileStorage.urlToFilePath`). Langfuse's sidebar groups pages from different URL paths (e.g. "Tracing" → `/docs/observability/get-started`), so the categories are lost.
- Collapsed sidebar folders are rendered empty in the HTML. The crawler finds those pages only if something else links to them.
- Fumadocs sites (Langfuse) embed the full sidebar tree in every page's serialized data, as nodes of type `separator`, `link` and `folder` (with `children`).
- DeepWiki's website rate-limits plain HTTP clients (HTTP 429), but it runs a public MCP server at `https://mcp.deepwiki.com/mcp` with tools to list a repo's documentation topics and read its wiki contents.
- `bin/docs_dl` currently guesses the mode from URL regexes.

## 3. Architecture

```
src/
  sources/
    types.ts            SourceHandler, Finding, Probe, RunOptions, RunResult
    registry.ts         registerHandler(); detect(url) fans out to handlers, ranks findings
    probe.ts            HTTP probe (no browser)
    templates/
      deepwiki.ts       fixed-structure template (MCP)
      github.ts         scan-first template (replaces direct github-docs auto-mode)
    handlers/
      skills.ts         wraps downloadSkill (used by github template + direct skills URLs)
      docsSite.ts       wraps the crawler, sidebar-aware
      singlePage.ts     wraps clipPage (fallback)
      documents.ts      flags linked PDF/Office/image files (not runnable in v1)
  nav/
    types.ts            NavNode
    registry.ts         picks the extractor for a page or repo
    extractors/
      fumadocs.ts       embedded page tree in HTML
      domExpand.ts      Playwright: expand all collapsed sidebar folders, read the menu
      mkdocs.ts         mkdocs.yml `nav:`
      summaryMd.ts      mdBook / GitBook SUMMARY.md
      docusaurus.ts     sidebars.js/.ts plain-object exports (no code execution)
      fumadocsMeta.ts   Fumadocs meta.json files in a repo
    layout.ts           NavNode[] → planned file paths, _tree.json
  cli/detect.ts         `detect <url> [--json] [--run] [--only <kinds>] [--layout nav|url]`
```

Templates register before generic handlers. A template match (high confidence) outranks generic detection for the same content.

### 3.1 Interfaces

```ts
interface Probe {
  url: string; finalUrl: string; status?: number; contentType?: string;
  html?: string; llmsTxt?: string; sitemapUrls?: string[];
  frameworks: string[];             // fingerprints found in html
  fileLinks: string[];              // linked .pdf .docx .pptx .xlsx images
  needsBrowser: boolean;            // JS-only page
  errors: Record<string, string>;   // per-request failures
}

interface Finding {
  handler: string;                  // e.g. "docs-site", "github", "deepwiki"
  kind: string;                     // "docs-site" | "readme" | "doc-folder" | "skills" | "wiki" | "documents" | "page" | "llms-txt" | "sitemap"
  url: string;
  confidence: number;               // 0..1
  summary: string;                  // one line for the report
  command: string;                  // exact CLI command that downloads it
  runnable: boolean;                // false for "needs Docling" and info-only findings
  details?: Record<string, unknown>;// e.g. { framework, sections, pages, navSource }
}

interface SourceHandler {
  id: string;
  detect(probe: Probe): Promise<Finding[]>;
  run?(finding: Finding, opts: RunOptions): Promise<RunResult>;
}

type NavNode =
  | { type: 'separator'; name: string; children: NavNode[] }  // category; children = following items until next separator
  | { type: 'folder'; name: string; url?: string; children: NavNode[] }
  | { type: 'link'; name: string; url: string };

interface NavExtractor {
  id: string;
  matches(input: { html?: string; repoFiles?: string[] }): boolean;
  extract(input: ExtractInput): Promise<NavNode[]>;
}
```

Extractors that return flat separator markers (as Fumadocs does) are normalised so that each separator owns the items after it, up to the next separator.

## 4. Data flow

### 4.1 `detect <url>`

1. **Probe** (`probe.ts`, plain `fetch`, 5 s timeout per request, run in parallel): the URL itself, `<origin>/llms.txt` and `<origin>/sitemap.xml`. Fingerprint frameworks (Fumadocs page tree, Docusaurus, Mintlify, GitBook, MkDocs, Nextra, Sphinx, generator meta) and collect file links.
2. If the page has almost no text and no framework markers, set `needsBrowser`. The docs-site handler then opens it once in Playwright to finish detection.
3. Every handler's `detect(probe)` runs; findings are ranked by confidence.
4. Output:
   - default: a human-readable report (example below);
   - `--json`: `{ url, findings: Finding[] }`;
   - `--run`: execute the top runnable finding. For the GitHub template, that means all of its runnable findings (see §6.2). If the top finding isn't runnable (e.g. needs Docling), say so and run the best runnable one instead.

```
Langfuse docs  (https://langfuse.com/docs)

✔ Docs site        Fumadocs · sidebar tree found: 9 sections, 214 pages
    → doc-dl crawl https://langfuse.com/docs            [recommended]
✔ llms.txt         page index (no categories)
✔ sitemap.xml      1,032 URLs
• Documents        3 PDFs linked — need Docling conversion (not yet supported)

Run the recommended workflow:  doc-dl detect https://langfuse.com/docs --run
```

### 4.2 Crawl with a sidebar tree (`--layout nav`, the default)

1. Render the start page and run the nav registry: framework extractor first, then `domExpand` as fallback.
2. `layout.ts` converts the tree into `Map<url, plannedPath>`.
3. Seed the queue with every in-scope sidebar URL. Link discovery continues as today.
4. Each page: render → convert → save at its planned path, or at `_unlisted/<url-path>.md` if it isn't in the sidebar. Frontmatter: `title`, `source_url`.
5. Write `_tree.json`. The index DB records url → path as today.

If no tree is found, log `no sidebar tree found; using URL layout` and fall back to `--layout url` (today's behaviour).

### 4.3 Layout rules (`layout.ts`)

- Names are slugified sidebar labels, prefixed with their sibling position: `01-`, `02-`, … The padding width fits the sibling count (`001-` once a folder has 100 or more items).
- Separators and folders become directories. A folder with its own page stores it as `00-index.md`.
- **Slug collisions** between siblings: append `-<8-char sha256>` of the original label.
- **Empty slug** (e.g. emoji-only label): use the URL's last path segment.
- **Duplicate URL** in the tree: saved at its first position; later positions become `{ "ref": "<first path>" }` in `_tree.json`.
- **Out-of-scope or external links:** recorded in `_tree.json` as `{ "external": true }` and not downloaded.

`_tree.json`:

```json
{
  "source": "https://langfuse.com/docs",
  "framework": "fumadocs",
  "extractedAt": "2026-11-15T00:00:00Z",
  "tree": [
    { "type": "separator", "name": "Get Started with", "path": "02-get-started-with", "children": [
      { "type": "link", "name": "Tracing", "url": "https://langfuse.com/docs/observability/get-started", "path": "02-get-started-with/01-tracing.md" }
    ]}
  ]
}
```

## 5. Command-line interface

```
doc-dl detect <url> [--json] [--run] [--only <kinds>] [--layout nav|url] [crawl options…]
doc-dl crawl  <url> [outputDir] [--layout nav|url] [existing options…]
```

- `--only` takes a comma-separated list of finding kinds (`readme,doc-folder,skills,wiki,docs-site`). It applies to `--run`.
- Crawl options are passed through to the crawler when `--run` crawls.
- `bin/ddocs <url>` and `bin/docs_dl <url>` (auto mode) call `detect --run`. Explicit mode flags (`--clip`, `--crawl`, `--gh`, `--skill`) keep working.
- The `doc-dl` name is used in this spec. The final binary name is decided separately (GUIDE §8 issue 7). Until then the commands are reachable as `ddocs detect`, `npm run detect -- <url>` and `node dist/src/cli/detect.js`.

Exit codes: `0` success (including warnings), `1` URL can't be reached or invalid arguments, `2` `--run` found nothing runnable.

## 6. Templates

A template is a `SourceHandler` for a known provider. It matches by URL with high confidence and knows how to list and fetch that provider's pages without generic probing or crawling.

### 6.1 DeepWiki (fixed structure)

- **Match:** `https://deepwiki.com/<owner>/<repo>[/…]`.
- **Detect:** call the MCP server (`https://mcp.deepwiki.com/mcp`, JSON-RPC over HTTP) to list the repo's documentation topics and turn them into `NavNode[]`.
- **Run:** read the wiki contents and split them into pages along the topic structure. Write them with the layout rules from §4.3, under `<root>/deepwiki/<owner>-<repo>/`.
- **Unavailable or rate-limited:** the finding is marked `runnable: false` with the reason, and the GitHub template for the same repo is suggested.
- To confirm during implementation: the exact tool names and the content format (whether contents arrive per topic or as one document needing splitting).

### 6.2 GitHub (scan first)

- **Match:** `github.com/<owner>/<repo>[/tree/<ref>/<path>]` and `owner/repo` shorthand.
- **Scan:** one recursive git-tree API call (`fetchGitTreeRecursive`, which already exists) plus repo metadata (default branch, homepage).
- **Findings**, one per documentation set:
  - `readme`: root README (and README files in top-level folders, when they're the only docs in that folder);
  - `doc-folder`: `docs/`, `documentation/`, `doc/`, `website/docs/`, or a folder holding a nav config. If a nav config is found (`mkdocs.yml`, `SUMMARY.md`, Docusaurus `sidebars.*`, Fumadocs `meta.json`), the matching extractor builds the tree and the folder is downloaded in sidebar layout;
  - `skills`: skills folders, as the skills downloader already detects them;
  - `documents`: PDF/Office/image files in documentation folders (not runnable);
  - **cross-suggestions** (info only, not run): the homepage, when it looks like a docs site, and `https://deepwiki.com/<owner>/<repo>`.
- **Run:** all runnable findings, each into its own subfolder of `<base>/<repo>/` (`README.md`, `docs/…`, `skills/…`). `--only` narrows this.
- `GITHUB_TOKEN`/`GH_TOKEN` is used when set. On a rate-limit 403, the report adds a hint and marks the findings uncertain.

### 6.3 Reading repo sidebar configs

- `mkdocs.yml`: YAML `nav:` (strings, `{label: path}`, nested lists).
- `SUMMARY.md`: nested Markdown list of links; `#` headings become separators.
- Docusaurus `sidebars.js|ts`: parsed as text for plain object/array literals only. If parsing fails, fall back to the folder structure with a warning. No code is executed.
- Fumadocs `meta.json`: `pages` order arrays per folder; `---Label---` entries are separators.

## 7. Error handling

- **Probe failures** are recorded in `probe.errors`. Handlers work with whatever succeeded. `detect` exits 1 only if the main URL can't be reached.
- **Fallback:** if nothing matches, a low-confidence `page` (single-page clip) finding is always returned.
- **Sidebar readers:** on failure or an empty tree, the next extractor is tried; if all fail, the URL layout is used, with a warning.
- **`domExpand`:** capped at 500 clicks and 60 s.
- **Tree checks:** only same-origin, in-scope links are downloaded.
- **HTTP 4xx/5xx pages are not saved.** They're logged and counted in the crawl summary. This changes current crawler behaviour and fixes GUIDE §8 issue 2.
- **Reruns:** already-indexed pages are skipped as today. If a page's planned path changed because the sidebar changed, the file is moved and its index row updated. `--force` downloads everything again.
- **`--run` scope:** it never downloads anything the report didn't list.

## 8. Testing

**Unit tests** (`node:test`, no network; fixtures in `test/fixtures/`):

- **Probe and detect:** HTML fixtures (trimmed Langfuse/Fumadocs, Docusaurus, a JS-only page), `llms.txt` and sitemap produce the expected findings, ranking and exit codes.
- **Extractors:** the Fumadocs fixture gives the expected tree (separator "Get Started with" → link "Tracing" + folder "Prompt & Skill Management" with two links). Each config reader is tested against a small fixture.
- **Layout:** numbering and padding, collision hashes, empty-slug fallback, duplicate `ref`, `_unlisted/`, and the `_tree.json` shape.
- **GitHub template:** a fake git-tree fixture gives one finding per documentation set; `--only` filtering works.
- **DeepWiki template:** with a fake MCP client, topics become a tree, and errors or rate limits produce an unavailable finding.
- **`--run` selection:** with fake handlers, it skips non-runnable findings and returns exit code 2 when nothing is runnable.

**Integration tests** (opt-in, `DOC_DL_LIVE_TESTS=1`):

- `detect https://langfuse.com/docs` finds Fumadocs with a non-empty tree.
- A crawl of a small Langfuse subsection writes numbered folders and `_tree.json`.
- The GitHub template runs against a small public repo with `mkdocs.yml`.

**Manual check before calling it done:** a full Langfuse crawl, comparing the folder tree with the live sidebar.

## 9. Build order

1. `nav/types`, `nav/layout`, the Fumadocs extractor, and crawler `--layout nav` (delivers the Langfuse case on its own).
2. `sources/types`, `registry`, `probe`, generic handlers, and `cli/detect` (report, `--json`).
3. GitHub template and the repo sidebar-config readers.
4. DeepWiki template.
5. `--run`, then switch the `ddocs`/`docs_dl` auto mode to `detect --run`.
6. `domExpand` fallback extractor.
7. Docs: README, GUIDE and AGENTS.md updates.

## 10. Future work (not in v1)

- A Docling handler (convert PDF/Office/HTML to Markdown or DocLang) and a docling-context ingestion output that uses `_tree.json` to build the context tree.
- More templates: Read the Docs, docs.rs, pkg.go.dev, GitBook-hosted, Mintlify-hosted.
- More framework extractors: Docusaurus, Mintlify, GitBook and Nextra (live sites).
- External plugin packages registering handlers and extractors.
