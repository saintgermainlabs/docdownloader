# Detect, Sidebar-Aware Crawling & Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `detect <url>` (report / `--json` / `--run`), crawls that keep the docs site's sidebar tree as numbered folders, and DeepWiki + GitHub provider templates.

**Architecture:** Two registries in the TypeScript core. *Source handlers* (`src/sources/`) take a cheap HTTP `Probe` and return ranked `Finding`s; templates are handlers for known providers. *Nav extractors* (`src/nav/`) turn a page or a repo's config file into a `NavNode[]` tree, and `layout.ts` turns that into planned file paths. The existing crawler, GitHub, skills and clip code is wrapped, not rewritten.

**Tech Stack:** TypeScript (CommonJS, `tsc`), Node ≥ 18 global `fetch`, Playwright, `yaml` (already a dependency), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-15-detect-and-nav-tree-design.md`

## Preconditions

- The public-release cleanup is still uncommitted in the working tree. Commit it first (with the user's OK), then do this work on a branch: `git switch -c feat/detect-nav-tree`.
- Tests run from compiled output: `npm test` = `tsc && node --test dist/test/*.js`. **Test files must sit directly in `test/`** (subfolders are not picked up). Read fixtures with `join(__dirname, '..', '..', 'test', 'fixtures', name)`, because `__dirname` is `dist/test` at runtime.
- To run one test file: `npx tsc && node --test dist/test/<name>.test.js`.

## Global Constraints

- No new runtime dependencies. Use `yaml` for YAML, global `fetch` for HTTP, and `crypto` for hashes.
- Probe requests: 5 s timeout each, run in parallel. No browser unless `needsBrowser`.
- Layout: prefix `NN-` per sibling position, zero-padded to the sibling count's digit count (minimum 2: `01-`; `001-` once a folder has 100 or more items). A folder's own page is `00-index.md`.
- Slug collision suffix: `-` + first 8 hex chars of sha256(original label).
- `_tree.json` shape: `{ source, framework, extractedAt, tree }` (spec §4.3).
- Frontmatter on every saved crawl page: `title`, `source_url`.
- `domExpand` caps: 500 clicks, 60 s.
- Exit codes: `0` success (warnings allowed), `1` unreachable URL or invalid arguments, `2` `--run` found nothing runnable.
- HTTP 4xx/5xx pages are never saved.
- No code from repos is executed (Docusaurus sidebars are parsed as text).
- Live-network tests run only when `DOC_DL_LIVE_TESTS=1`; browser-needing tests also require it.
- `--layout nav` is the default for `crawl`; `--layout url` keeps today's behaviour.

## Review Focus

1. **Sidebar URLs vs crawled URLs:** trailing slashes, `#hash` and relative hrefs (`/docs/x` vs `https://site/docs/x/`) must still match, or every page lands in `_unlisted/`. Test: Task 3, `matchPlannedPath`.
2. **Non-ASCII labels** (CJK, accented): slugs keep Unicode letters instead of collapsing to empty. Test: Task 1, `slugifyLabel`.
3. **Redirects** (`/docs` → `/docs/`, http → https): scope, `llms.txt` origin and the report use `finalUrl`. Test: Task 4.
4. **GitHub `/tree/<ref>/<path>` URLs:** the scan is limited to that subtree and that ref. Test: Task 8.
5. **Truncated GitHub trees** (very large repos return `truncated: true`): report a warning finding instead of silently missing docs. Test: Task 8.

---

### Task 1: Nav types and layout planner

**Files:**
- Create: `src/nav/types.ts`, `src/nav/layout.ts`
- Test: `test/navLayout.test.ts`

**Interfaces:**
- Produces:
  - `type NavNode = { type: 'separator'; name: string; children: NavNode[] } | { type: 'folder'; name: string; url?: string; children: NavNode[] } | { type: 'link'; name: string; url: string }`
  - `interface PlannedTreeNode { type; name; url?; path?: string; ref?: string; external?: true; children?: PlannedTreeNode[] }`
  - `interface LayoutPlan { paths: Map<string, string>; tree: PlannedTreeNode[] }`: keys are normalized absolute URLs, values are relative `.md` paths
  - `slugifyLabel(label: string): string`
  - `normalizeSeparators(nodes: NavNode[]): NavNode[]`: makes each flat separator own the following items, up to the next separator
  - `planLayout(nodes: NavNode[], opts: { baseUrl: string; inScope: (url: string) => boolean }): LayoutPlan`
  - `buildTreeJson(plan: LayoutPlan, meta: { source: string; framework: string }): object`

- [ ] **Step 1: Write failing tests** in `test/navLayout.test.ts`:
  - `slugifyLabel('Get Started with') === 'get-started-with'`; `slugifyLabel('Prompt & Skill Management') === 'prompt-and-skill-management'` (`&` → `and`); `slugifyLabel('快速开始') === '快速开始'`; `slugifyLabel('🚀') === ''`.
  - `normalizeSeparators([sep('A'), link('x'), sep('B'), link('y')])` → two separators, each with one child.
  - `planLayout` on the Langfuse shape `[link Overview /docs, sep 'Get Started with' → [link Tracing /docs/observability/get-started, folder 'Prompt & Skill Management' → [link Prompt Management /docs/prompt-management/get-started, link Skill Management /docs/skill-management/get-started]]]` with `baseUrl https://langfuse.com/docs` gives paths `01-overview.md`, `02-get-started-with/01-tracing.md`, `02-get-started-with/02-prompt-and-skill-management/01-prompt-management.md`, `…/02-skill-management.md`.
  - A folder with `url` → `<folder>/00-index.md`.
  - 12 siblings → first is `01-`; 100 siblings → first is `001-`.
  - Two sibling labels `C#` and `C++` (both would slug to `c`) → names end with `-` + 8 hex chars and differ.
  - Empty slug label `🚀` linking to `/docs/launch` → `01-launch.md`.
  - Same URL twice → second tree node has `ref` equal to the first path, and `paths` has one entry.
  - Link to `https://github.com/x` (fails `inScope`) → tree node `external: true`, no path.
  - `buildTreeJson` has keys `source`, `framework`, `extractedAt` (ISO string) and `tree`.
- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../src/nav/layout'`).
- [ ] **Step 3: Implement `src/nav/types.ts` and `src/nav/layout.ts`.** Slug: lowercase, `&` → `and`, replace runs of chars not matching `[\p{L}\p{N}]` (with the `u` flag) by `-`, then trim `-`. Resolve relative URLs against `baseUrl` and normalize with the existing `normalizeUrl` from `src/crawler/urlUtils.ts`; also strip a trailing `/` (except at the root) for map keys.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(nav): NavNode types and numbered layout planner`.

### Task 2: Fumadocs extractor and nav registry

**Files:**
- Create: `src/nav/registry.ts`, `src/nav/extractors/fumadocs.ts`, `test/fixtures/langfuse-docs.html`
- Test: `test/navFumadocs.test.ts`

**Interfaces:**
- Consumes: `NavNode`, `normalizeSeparators` (Task 1).
- Produces:
  - `interface ExtractInput { html?: string; page?: import('playwright').Page; url: string; repoFiles?: Map<string, string> }`
  - `interface NavExtractor { id: string; matches(input: ExtractInput): boolean; extract(input: ExtractInput): Promise<NavNode[]> }`
  - `registerExtractor(e: NavExtractor): void`; `extractNav(input: ExtractInput): Promise<{ framework: string; nodes: NavNode[] } | null>`, which tries matching extractors in registration order and returns the first non-empty result
  - `fumadocsExtractor: NavExtractor` (id `'fumadocs'`)

- [ ] **Step 1: Create the fixture.** `curl -sL -A "Mozilla/5.0" https://langfuse.com/docs`, then trim it to the `<head>` plus the serialized page-tree script chunk(s), keeping it under ~200 KB.
- [ ] **Step 2: Write failing tests:**
  - `fumadocsExtractor.matches({html})` is true for the fixture and false for `'<html><body>hi</body></html>'`.
  - `extract` returns a tree that contains a separator named `Get Started with` whose first child is link `Tracing` → `https://langfuse.com/docs/observability/get-started`, and whose second child is folder `Prompt & Skill Management` with links `Prompt Management` and `Skill Management`.
  - URLs are absolute (relative `/docs/...` resolved against `input.url`).
  - `extractNav({ html: '<html></html>', url })` resolves to `null`.
- [ ] **Step 3: Implement.** The tree is inside RSC push chunks (`self.__next_f.push([1,"…"])`). Unescape each chunk's JSON string, find the JSON array that contains objects with `"type":"separator"|"link"|"folder"`, and parse it by bracket-matching from the array's `[`. Map `name`, `url` and `children`, ignoring `$id`/`$ref`/`icon`. Run the result through `normalizeSeparators`. Register in `registry.ts` at module load.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(nav): fumadocs page-tree extractor and extractor registry`.

### Task 3: Crawler `--layout nav`

**Files:**
- Modify: `src/index.ts` (`CliOptions`, `parseCliArgs`, `main`, help text), `src/storage/fileSystem.ts`
- Create: `src/nav/crawlLayout.ts`
- Test: `test/crawlLayout.test.ts`, extend `test/cli.test.ts`

**Interfaces:**
- Consumes: `planLayout`, `buildTreeJson` (Task 1); `extractNav` (Task 2).
- Produces:
  - `CliOptions.layout: 'nav' | 'url'` (default `'nav'`); `main(..., debug?, layout: 'nav' | 'url' = 'nav')` as the new last parameter
  - `matchPlannedPath(plan: LayoutPlan, url: string): string | undefined`, which uses the same normalization as Task 1
  - `unlistedPath(url: URL): string` → `_unlisted/<pathname>.md` (same mapping as today's `urlToFilePath`)
  - `shouldSavePage(status: number | undefined): boolean` (false for ≥ 400)
  - `FileStorage.saveMarkdownAt(relPath: string, content: string, frontmatter: { title: string; source_url: string }): Promise<SavedFileResult>`
  - `relocateIfMoved(baseDir: string, oldPath: string, newPath: string): Promise<boolean>`

- [ ] **Step 1: Write failing tests:**
  - `parseCliArgs(['https://x/docs', '--layout', 'url']).layout === 'url'`; default `'nav'`; `--layout=nav` works.
  - `matchPlannedPath` finds a plan entry for `https://langfuse.com/docs/observability/get-started/`, `…/get-started#intro` and `…/get-started` alike.
  - `unlistedPath(new URL('https://x/docs/a/b/'))` → `_unlisted/docs/a/b/index.md`.
  - `shouldSavePage(200)` true; `404` and `500` false; `undefined` true (cached response).
  - `saveMarkdownAt` (temp dir) writes the file with frontmatter `title:` and `source_url:` lines, creating parent folders.
  - `relocateIfMoved` moves an existing file and returns true; returns false when the old file is missing or the path is unchanged.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the helpers, then wire `main`.** When `layout === 'nav'`, after `browser.init()`, load the start page once and call `extractNav({ page, html, url })`.
  - **Tree found:** `planLayout` → enqueue every planned in-scope URL → in the worker, save at `matchPlannedPath(...) ?? unlistedPath(...)` via `saveMarkdownAt`. If a page is already in the DB but its recorded path differs from the planned path, call `relocateIfMoved` and update the record with `db.recordVisited`. After the workers finish, write `_tree.json`.
  - **No tree:** log `no sidebar tree found; using URL layout` and continue as `url`.
  - **Both layouts:** skip saving when `!shouldSavePage(status)`, and count those pages in a new `totalHttpErrors` in the summary.
  - Update the help text with `--layout nav|url`.
- [ ] **Step 4: Run all tests** (`npm test`); expect PASS, including the existing 62.
- [ ] **Step 5: Commit** `feat(crawl): sidebar-tree layout (--layout nav default), skip HTTP error pages`.

### Task 4: Source types and HTTP probe

**Files:**
- Create: `src/sources/types.ts`, `src/sources/probe.ts`
- Test: `test/probe.test.ts`

**Interfaces:**
- Produces:
  - `Probe`, `Finding`, `SourceHandler` exactly as in spec §3.1, plus `interface RunOptions { outputDir?: string; dbPath?: string; force?: boolean; concurrency?: number; layout?: 'nav' | 'url'; only?: string[]; debug?: boolean }` and `interface RunResult { outputDir: string; filesWritten: number; warnings: string[] }`
  - `type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ status: number; url: string; headers: { get(n: string): string | null }; text(): Promise<string> }>`
  - `probeUrl(url: string, fetchImpl: FetchLike = fetch): Promise<Probe>`
  - `detectFrameworks(html: string): string[]`: ids `fumadocs`, `docusaurus`, `mintlify`, `gitbook`, `mkdocs`, `nextra`, `sphinx`
  - `findFileLinks(html: string, baseUrl: string): string[]`: absolute URLs ending in `.pdf .docx .doc .pptx .xlsx .png .jpg .jpeg .tif .tiff .webp` (case-insensitive)

- [ ] **Step 1: Write failing tests** with a fake `FetchLike` (no network):
  - Given `/docs` answering with final URL `https://site/docs/`, `probe.finalUrl === 'https://site/docs/'` and `llms.txt` is requested at `https://site/llms.txt`.
  - `llms.txt` 404 → `probe.llmsTxt === undefined`, no throw; a sitemap with 3 `<loc>` entries → `sitemapUrls.length === 3`.
  - A request that rejects (timeout or DNS) → `probe.errors['sitemap']` is set and the other fields are still filled.
  - A main URL that rejects → `probeUrl` rejects with an `Error` whose message contains the URL.
  - `detectFrameworks(langfuseFixture)` includes `'fumadocs'`; `detectFrameworks('<meta name="generator" content="Docusaurus v3">')` includes `'docusaurus'`.
  - `findFileLinks('<a href="/a.PDF">', 'https://s/')` → `['https://s/a.PDF']`.
  - HTML with under 200 characters of visible text and no framework → `needsBrowser === true`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Run the three requests in parallel, each with `AbortSignal.timeout(5000)`, and set `User-Agent: doc-dl` (no contact details). Parse sitemap `<loc>` with a regex; a sitemap index's nested sitemaps are not followed in v1.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(sources): probe, framework fingerprints, core types`.

### Task 5: Handler registry and generic handlers

**Files:**
- Create: `src/sources/registry.ts`, `src/sources/handlers/docsSite.ts`, `singlePage.ts`, `documents.ts`, `siteIndex.ts` (info findings for `llms.txt` and sitemap)
- Test: `test/sourceRegistry.test.ts`

**Interfaces:**
- Consumes: Task 4 types; `extractNav` (Task 2) for the docs-site handler's tree summary.
- Produces:
  - `registerHandler(h: SourceHandler, opts?: { template?: boolean }): void` (templates are kept ahead of generic handlers)
  - `detectAll(probe: Probe): Promise<Finding[]>`: sorted by confidence (descending), templates first when equal; always contains at least the `singlePage` fallback (`kind: 'page'`, confidence `0.1`)
  - `getHandler(id: string): SourceHandler | undefined`
  - Handler ids and kinds: `docs-site` / `docs-site`; `single-page` / `page`; `documents` / `documents` (`runnable: false`, summary contains `need Docling conversion`); `site-index` / `llms-txt` and `sitemap` (`runnable: false`, info only)
  - `docsSite.detect`: confidence `0.9` when a framework is found or `extractNav` returns a tree, `0.6` when the URL path contains `/docs|/documentation|/guide|/manual`; `details: { framework, sections, pages }`; `command: 'doc-dl crawl <finalUrl>'`
  - `createDocsSiteHandler(deps?: { render?: (url: string) => Promise<string> }): SourceHandler`: when `probe.needsBrowser`, it calls `render` once (default: Playwright `BrowserManager`, page `content()` after `domcontentloaded` + 500 ms) and reruns fingerprinting and `extractNav` on the rendered HTML

- [ ] **Step 1: Write failing tests:**
  - Probe from the Langfuse fixture → the first finding is `docs-site` with `details.framework === 'fumadocs'` and `pages > 0`. A `llms-txt` finding is present when `probe.llmsTxt` is set; a `documents` finding with `runnable === false` is present when `fileLinks` contains a `.pdf`.
  - A bare probe (`<p>hello</p>`, no extras) → exactly one finding, `kind 'page'`, `runnable true`.
  - A template handler registered with `{ template: true }` at the same confidence sorts before a generic one.
  - A probe with `needsBrowser: true` and a fake `render` returning the Langfuse fixture → `render` called once, and the `docs-site` finding has `framework 'fumadocs'`. With `needsBrowser: false`, `render` is never called.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `docsSite.run` calls `main(finding.url, opts.outputDir, 'subfolder', opts.concurrency ?? 3, opts.dbPath, opts.force, undefined, undefined, undefined, opts.debug, opts.layout ?? 'nav')`. `singlePage.run` calls `clipPage`. Add a `resetRegistry()` helper so tests start from a clean registry.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(sources): handler registry with docs-site, page, documents, site-index handlers`.

### Task 6: `detect` CLI (report and `--json`)

**Files:**
- Create: `src/cli/detect.ts` (with a `#!/usr/bin/env node` shebang and a `require.main === module` entry)
- Modify: `package.json` (`scripts.detect: "tsc && node dist/src/cli/detect.js"`, `bin.doc-dl-detect: "./dist/src/cli/detect.js"`), `bin/ddocs` (new `detect)` case that execs `dist/src/cli/detect.js`)
- Test: `test/detectCli.test.ts`

**Interfaces:**
- Consumes: `probeUrl` (Task 4), `detectAll` (Task 5).
- Produces:
  - `parseDetectArgs(argv: string[]): { url: string; json: boolean; run: boolean; only?: string[]; layout: 'nav' | 'url'; passthrough: string[]; help: boolean }`
  - `formatReport(probe: Probe, findings: Finding[]): string`
  - `runDetect(argv: string[], deps?: { probe?: typeof probeUrl; detect?: typeof detectAll; out?: (s: string) => void }): Promise<number>`, which returns the exit code

- [ ] **Step 1: Write failing tests:**
  - `parseDetectArgs(['https://x', '--json', '--only', 'docs-site,skills', '-c', '5'])` → `json` true, `only` `['docs-site','skills']`, `passthrough` `['-c','5']`.
  - `formatReport` marks the first runnable finding `[recommended]`, prints `✔` before runnable findings and `•` before info-only ones, and ends with `Run the recommended workflow:  doc-dl detect <url> --run`.
  - `runDetect(['https://x','--json'], fakes)` writes parseable JSON `{ url, findings }` and returns `0`.
  - A fake probe that rejects → returns `1` and prints the error.
  - No URL → returns `1` and prints usage.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (`--run` parsing only; executing it comes in Task 10). Register the built-in handlers by importing `src/sources/handlers/index.ts`, a barrel that calls `registerHandler` for each handler.
- [ ] **Step 4: Run, expect PASS.** Also check that `node dist/src/cli/detect.js --help` exits 0.
- [ ] **Step 5: Commit** `feat(cli): detect command with text and JSON reports`.

### Task 7: Repo sidebar-config readers

**Files:**
- Create: `src/nav/extractors/mkdocs.ts`, `summaryMd.ts`, `docusaurus.ts`, `fumadocsMeta.ts`, fixtures `test/fixtures/repo-mkdocs.yml`, `repo-SUMMARY.md`, `repo-sidebars.js`, `repo-sidebars-dynamic.js`, `repo-meta/` (`meta.json` files)
- Test: `test/navRepoConfigs.test.ts`

**Interfaces:**
- Consumes: `NavNode`, `ExtractInput.repoFiles: Map<repoPath, content>` (Task 2).
- Produces:
  - extractors with ids `mkdocs`, `summary-md`, `docusaurus`, `fumadocs-meta`, registered in `src/nav/registry.ts`
  - link `url`s are **repo-relative paths** (e.g. `docs/getting-started.md`); the GitHub template (Task 8) resolves them
  - `findNavConfigs(paths: string[]): Array<{ extractor: string; configPath: string; root: string }>`

- [ ] **Step 1: Write failing tests:**
  - mkdocs `nav: [{Home: index.md}, {Guide: [{Install: guide/install.md}]}]` with `docs_dir` default `docs` → `[link Home docs/index.md, folder Guide → [link Install docs/guide/install.md]]`.
  - `SUMMARY.md` with `# Part 1` then `- [Intro](intro.md)` + nested `  - [Deep](a/deep.md)` → `separator 'Part 1' → [link Intro …]`, where Intro has a child: link Deep is nested under a folder named `Intro` with `url: intro.md`.
  - Docusaurus plain object `{ docs: [{ type: 'category', label: 'Basics', items: ['intro'] }] }` → `folder Basics → [link intro docs/intro.md]`.
  - `repo-sidebars-dynamic.js` (uses `require`/function calls) → the extractor returns `[]` without throwing.
  - Fumadocs `meta.json` with `pages: ["index", "---Guides---", "setup"]` → `[link index, separator Guides → [link setup]]`.
  - `findNavConfigs(['docs/mkdocs.yml','README.md','book/SUMMARY.md'])` → two entries with the right roots.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - **mkdocs:** use `yaml`, honouring `docs_dir`.
  - **Docusaurus:** take the text after `module.exports =` / `export default` up to the matching brace. Turn it into JSON by quoting bare keys and converting single quotes, then `JSON.parse` inside try/catch. Any failure → `[]`. Never use `eval`/`Function`/`vm`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(nav): mkdocs, SUMMARY.md, docusaurus, fumadocs meta.json readers`.

### Task 8: GitHub template (scan first)

**Files:**
- Create: `src/sources/templates/github.ts`, fixture `test/fixtures/github-tree.json` (shaped like the git-trees API response: README, `docs/mkdocs.yml`, `docs/*.md`, `skills/foo/SKILL.md`, `docs/spec.pdf`)
- Modify: `src/github_docs/githubApi.ts`: `fetchRepoMetadata` also returns `homepage?: string`; `fetchGitTreeRecursive` exposes `truncated` (return `{ files, truncated }` from a new `fetchGitTreeWithMeta`, and keep the old function as a wrapper)
- Test: `test/githubTemplate.test.ts`

**Interfaces:**
- Consumes: `parseGithubUrl`, `fetchFileText`, `downloadSkill`, `downloadGithubDocs` (existing); `findNavConfigs` and the repo extractors (Task 7); `planLayout` (Task 1); `registerHandler(..., { template: true })` (Task 5).
- Produces:
  - `githubTemplate: SourceHandler` (id `'github'`); matches when `parseGithubUrl(probe.url)` succeeds
  - `scanRepo(info: GithubRepoUrlInfo, deps: { tree: () => Promise<{ files: GithubFileEntry[]; truncated: boolean }>; meta: () => Promise<{ defaultBranch: string; description: string; homepage?: string }> }): Promise<Finding[]>`
  - finding kinds: `readme`, `doc-folder` (`details.navConfig` when found), `skills`, `documents`, plus info-only `docs-site` (homepage) and `wiki` (DeepWiki URL `https://deepwiki.com/<owner>/<repo>`)
  - `run` writes into `resolveOutputDir(repo, 'repo')` subfolders: `README.md`, `<folder>/…` (numbered layout when there's a nav config, mirrored paths otherwise), `skills/…`

- [ ] **Step 1: Write failing tests** with fake deps:
  - The fixture → findings `readme`, `doc-folder` (with `details.navConfig === 'mkdocs'`), `skills`, `documents` (`runnable false`), `wiki` (`runnable false`, url `https://deepwiki.com/o/r`), all with confidence `0.95`.
  - `homepage: 'https://r.dev/docs'` → an info `docs-site` finding with command `doc-dl detect https://r.dev/docs`.
  - URL `https://github.com/o/r/tree/v2/docs` → only findings under `docs/`, and the `tree` dep is called with ref `v2`.
  - `truncated: true` → an extra finding of kind `warning` (`runnable false`) saying the scan is incomplete.
  - A `tree` dep that rejects with a 403 rate-limit error → a single `warning` finding whose summary contains `GITHUB_TOKEN`; `detect` does not throw.
  - A top-level folder `examples/` containing only `README.md` → its README is included in the `readme` finding's `details.files`; `docs/README.md` (a folder with other docs) is not listed separately.
  - The `run` path for a `doc-folder` with mkdocs (fake `fetchFileText`, temp dir) writes `01-home.md`-style numbered paths.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Map `--only` to finding kinds. Register in the handlers barrel with `{ template: true }`. `warning` is a new info-only finding kind (not runnable, shown with `•`); add it to the `Finding.kind` union in `src/sources/types.ts`.
- [ ] **Step 4: Run, expect PASS**, including the existing `githubDocs` tests.
- [ ] **Step 5: Commit** `feat(templates): scan-first GitHub template`.

### Task 9: DeepWiki template

**Files:**
- Create: `src/sources/templates/deepwiki.ts`, `src/sources/mcpClient.ts`
- Test: `test/deepwikiTemplate.test.ts`

**Interfaces:**
- Produces:
  - `interface McpClient { callTool(name: string, args: Record<string, unknown>): Promise<string> }`
  - `httpMcpClient(endpoint = 'https://mcp.deepwiki.com/mcp', fetchImpl = fetch): McpClient`: JSON-RPC `tools/call` over HTTP; parses JSON or SSE (`data:` lines) responses
  - `parseDeepwikiStructure(text: string): NavNode[]`
  - `deepwikiTemplate(client?: McpClient): SourceHandler` (id `'deepwiki'`); matches `https://deepwiki.com/<owner>/<repo>[/…]`

- [ ] **Step 1: Confirm the server contract** (needed by the remaining steps). POST `tools/list` to the endpoint, then call the structure and contents tools for `langfuse/langfuse`. Record the exact tool names and save trimmed responses as `test/fixtures/deepwiki-structure.txt` and `deepwiki-contents.txt`. If the contents arrive as one document, note the page-separator marker it uses.
- [ ] **Step 2: Write failing tests** with a fake client and the fixtures:
  - `parseDeepwikiStructure` produces nested nodes from the numbered topic list (`1`, `1.1`, `2` → `1.1` nested under `1`).
  - `detect` → one `wiki` finding, `runnable true`, confidence `0.95`, `details.pages > 0`, and a `github` cross-suggestion (info) for `https://github.com/<owner>/<repo>`.
  - A client that throws, or returns an HTTP 429 → finding `runnable false`, summary mentions `unavailable`, and the github suggestion is still present.
  - `run` with `outputDir` (temp dir) writes numbered files there; without `outputDir` (and `KNOWLEDGE_ROOT` set to a temp dir) it writes under `join(resolveKnowledgeRoot(), 'deepwiki', '<owner>-<repo>')`. Both include `_tree.json` with `framework: 'deepwiki'`.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement**, splitting contents by the marker recorded in Step 1. Register in the barrel with `{ template: true }`.
- [ ] **Step 5: Run, expect PASS.**
- [ ] **Step 6: Commit** `feat(templates): DeepWiki template via MCP`.

### Task 10: `--run` and wrapper auto-mode

**Files:**
- Modify: `src/cli/detect.ts`, `bin/ddocs`, `bin/docs_dl`
- Test: extend `test/detectCli.test.ts`

**Interfaces:**
- Consumes: `getHandler` (Task 5); `RunOptions` (Task 4).
- Produces: `selectRunnable(findings: Finding[], only?: string[]): Finding[]`. It returns the top runnable finding; when that finding's handler is `github`, it returns **all** runnable findings from that handler (filtered by `only`).

- [ ] **Step 1: Write failing tests:**
  - Top finding not runnable (documents), second runnable → `selectRunnable` returns the second, and `runDetect --run` prints a line containing `needs Docling` before running it.
  - Only info findings → `runDetect --run` returns `2`.
  - GitHub findings `readme`, `doc-folder`, `skills` with `only ['skills']` → returns only `skills`.
  - Passthrough `-c 5 --force` reaches the fake handler's `RunOptions` as `concurrency 5`, `force true`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `bin/docs_dl`, replace the `MODE="auto"` regex block with `exec node "${PROJECT_ROOT}/dist/src/cli/detect.js" "$URL" --run "${EXTRA_ARGS[@]}"` (after `KNOWLEDGE_ROOT` is exported). Explicit `-s/-c/-w/-g` modes stay unchanged. `ddocs <url>` already delegates to `docs_dl`.
- [ ] **Step 4: Run `npm test`, expect PASS.** Also check `bash -n bin/ddocs bin/docs_dl`.
- [ ] **Step 5: Commit** `feat(cli): detect --run executes the recommended workflow; wrappers use it`.

### Task 11: `domExpand` fallback extractor

**Files:**
- Create: `src/nav/extractors/domExpand.ts`, fixture `test/fixtures/collapsible-sidebar.html` (a `<nav>`/`<aside>` with `<button aria-expanded="false">` folders that reveal links on click via inline script, plus a non-link `<p>` category label)
- Test: `test/navDomExpand.test.ts` (whole suite skipped unless `DOC_DL_LIVE_TESTS=1`, because it needs Chromium)

**Interfaces:**
- Consumes: `ExtractInput.page`; registered **last** in the nav registry.
- Produces: `domExpandExtractor: NavExtractor` (id `'dom-expand'`); `matches` is true whenever `input.page` is set.

- [ ] **Step 1: Write the failing test.** Load the fixture with `page.setContent` → the tree has a separator for the `<p>` label, a folder for the button, and the revealed links as the folder's children, in DOM order.
- [ ] **Step 2: Run with `DOC_DL_LIVE_TESTS=1`, expect FAIL.**
- [ ] **Step 3: Implement.** Find the sidebar root (`nav[aria-label*=sidebar i]`, `aside nav`, `aside`, or the `nav` with the most links). Click `[aria-expanded="false"]` inside it repeatedly until none are left, 500 clicks or 60 s. Then walk the DOM: label elements without `href` that precede link groups → `separator`; buttons/summary → `folder`; `a[href]` → `link`.
- [ ] **Step 4: Run with `DOC_DL_LIVE_TESTS=1`, expect PASS.** Run `npm test` without the variable; expect the suite to be skipped and everything else to pass.
- [ ] **Step 5: Commit** `feat(nav): DOM-expansion fallback extractor`.

### Task 12: Live integration tests and docs

**Files:**
- Create: `test/live.test.ts` (skipped unless `DOC_DL_LIVE_TESTS=1`)
- Modify: `README.md`, `GUIDE.md` (§3 commands, §4 layout, §8 issue list: mark the HTTP-status issue fixed), `AGENTS.md` (§2 commands, §7 best practice: run `detect` first)

- [ ] **Step 1: Write the live tests:**
  - `runDetect(['https://langfuse.com/docs','--json'])` → top finding `docs-site`, `framework 'fumadocs'`, `pages > 50`.
  - Crawl `https://langfuse.com/docs/prompt-management` with `-c 3` into a temp dir → `_tree.json` exists and at least one path matches `/^\d{2}-/`.
  - GitHub template on a small public repo with `mkdocs.yml` (pick one during implementation; record it in the test) → `doc-folder` with `navConfig 'mkdocs'`.
- [ ] **Step 2: Run** `DOC_DL_LIVE_TESTS=1 npm test`; expect PASS. (This needs `npx playwright install chromium` first; ask the user before downloading the browser.)
- [ ] **Step 3: Update the docs** with the new commands, `--layout`, `_tree.json`, `_unlisted/` and the templates.
- [ ] **Step 4: Manual check.** Do a full `doc-dl crawl https://langfuse.com/docs -c 5` and compare the top two folder levels with the live sidebar. Note the result in the PR description.
- [ ] **Step 5: Commit** `test: live integration tests; docs: detect, nav layout, templates`.
