# Doc-DL architecture

A map of the code for people and agents who need to change it. Read [`PROJECT-STATUS.md`](PROJECT-STATUS.md) for what is finished and what is pending. Read [`../README.md`](../README.md) for install and usage, and [`../AGENTS.md`](../AGENTS.md) for the agent-facing command reference.

Facts here come from reading `src/` at commit `5c5565c`. Where a detail was not checked line by line, the text says so and points to the source.

---

## 1. The big picture

Doc-DL has three ways in and one shared core.

```
        ┌──────────── entry points ────────────┐
 ddocs / docs_dl ──► src/index.ts   main()      crawl a docs site (nav or url layout)
 npm run detect  ──► src/cli/detect.ts          probe a URL, list findings, optionally --run
 npm run clip    ──► src/scripts/clip.ts        one page → Markdown in clippings/
 npm run skill   ──► src/skills/index.ts        agent skills from a GitHub repo
 npm run github-docs ─► src/github_docs/index.ts  doc folders from a GitHub repo
 npm run process-list ─► src/scripts/processList.ts  batch of URLs from data/pending.*
        └──────────────────────────────────────┘
                          │ shared core
   ┌──────────────┬───────┴────────┬──────────────────┬──────────────────┐
 crawler/        converter/       nav/               storage/           sources/
 browser.ts      markdown.ts      layout + extractors fileSystem.ts      probe, registry,
 queue.ts        (Turndown)       (sidebar tree)      database.ts        handlers, templates
 urlUtils.ts                                          paths.ts
```

Two ideas run through the code:

- **Probe, then act.** `detect` looks at a URL and reports *findings* (things that can be downloaded and the command to do it). The `docdl` CLI (not built yet) is meant to sit on top of that same probe. See §6.
- **Registries.** Sources (what a URL is), navigation extractors (how a sidebar is read) and templates (how a GitHub repo or DeepWiki is handled) are plug-ins registered at start-up. Adding one does not require touching the crawler.

---

## 2. Module map

| Path | Role | Key exports (checked) |
|---|---|---|
| `src/index.ts` | Main crawler. Parses CLI args (`parseCliArgs`), runs the crawl (`main`), prints help. | `parseCliArgs`, `main`, `printMainCliHelp`, `CrawlSummary`, `CrawlLayout` |
| `src/crawler/browser.ts` | Playwright Chromium wrapper for JS-rendered pages. Launch options come from env. | `BrowserManager`, `browserLaunchOptions` |
| `src/crawler/queue.ts` | Work queue with concurrency limit. | `CrawlerQueue` |
| `src/crawler/urlUtils.ts` | URL normalisation and scope checks (`subfolder` vs `website`). | `normalizeUrl`, `isUrlInScope`, `CrawlScope` |
| `src/converter/markdown.ts` | HTML → Markdown with Turndown, plus cleanup of tracking attributes, nav and footer noise. | `MarkdownConverter` |
| `src/storage/fileSystem.ts` | Writes Markdown files under the output directory. | `FileStorage`, `SavedFileResult` |
| `src/storage/database.ts` | Index of sources and visited pages. SQLite by default, Postgres with `DATABASE_URL`. | `VisitedDatabase`, `computeHash`, `extractDefaultSlug`, `SourceRecord`, `VisitedRecord` |
| `src/storage/paths.ts` | Where output goes: `./output`, `KNOWLEDGE_ROOT`, or `/srv/knowledge` when `HOST_ENV=remote`. | `resolveOutputDir`, `resolveKnowledgeRoot`, `resolveSkillsDir`, `resolveClippingDir`, `DEFAULT_OUTPUT_ROOT` |
| `src/nav/types.ts` | Navigation tree types (`NavNode`, `PlannedTreeNode`, `LayoutPlan`). | |
| `src/nav/registry.ts` | Registry of navigation extractors. | `registerExtractor`, `getExtractor`, `listExtractors`, `NavExtractor` |
| `src/nav/extractors/*.ts` | One extractor per framework: `mkdocs`, `summary-md` (mdBook or GitBook `SUMMARY.md`), `docusaurus`, `fumadocs`, `fumadocs-meta`, `dom-expand` (fallback that expands the DOM and reads links). | Each file registers itself via `registerExtractor` |
| `src/nav/layout.ts` | Turns a nav tree into numbered folders and file paths, and builds `_tree.json`. | `planLayout`, `buildTreeJson`, `slugifyLabel`, `navUrlKey`, `normalizeSeparators` |
| `src/nav/crawlLayout.ts` | Uses a layout plan during the crawl: matches URLs to planned paths, handles redirects, decides which HTTP statuses to save. | `matchPlannedPath`, `unlistedPath`, `redirectTarget`, `shouldSavePage`, `carryPlannedPath`, `queueKey`, `scopeBaseAfterRedirect` |
| `src/nav/repoConfigs.ts` | Per-repo overrides for GitHub doc sets. | |
| `src/sources/types.ts` | `Probe`, `Finding`, `FindingKind`, `SourceHandler`, `RunOptions`, `RunResult`. | |
| `src/sources/probe.ts` | Fetches a URL and reads it: framework fingerprints, file links. | `detectFrameworks`, `findFileLinks`, `FetchLike` |
| `src/sources/registry.ts` | Registry of source handlers. Templates are flagged with `template: true`. | `registerHandler`, `getHandler`, `resetRegistry` |
| `src/sources/handlers/index.ts` | Registers the built-in handlers (order below). | `registerBuiltinHandlers` |
| `src/sources/handlers/docsSite.ts` | `docs-site`: finds a docs site and its sidebar. | `createDocsSiteHandler` |
| `src/sources/handlers/simple.ts` | `single-page`, `documents`, `site-index`. | `singlePageHandler`, `documentsHandler`, `siteIndexHandler` |
| `src/sources/templates/github.ts` | GitHub template: scan-first, finds every doc set in a repo. | `createGithubTemplate` |
| `src/sources/templates/deepwiki.ts` | DeepWiki template, via MCP. | `deepwikiTemplate` |
| `src/sources/mcpClient.ts` | MCP client used by the DeepWiki template. | |
| `src/cli/detect.ts` | `detect` command: argument parsing, report formatting, `--run`. | `runDetect`, `parseDetectArgs`, `selectRunnable`, `formatReport`, `normalizeInputUrl` |
| `src/github_docs/*` | `github-docs` command: lists and downloads doc folders and README from a GitHub repo. | `downloadGithubDocs` |
| `src/skills/*` | `skill` command: installs `SKILL.md`-style skills into `skills/`. | `downloadSkill`, `SkillDownloadOptions`, `SkillDownloadResult` |
| `src/scripts/clip.ts` | `clip` command: one page → `clippings/`. | |
| `src/scripts/processList.ts` | `process-list`: runs a crawl for each URL in `data/pending.*`. | |
| `src/scripts/importDocs.ts` | `import-docs`: imports docs into the index. | |
| `src/utils/logger.ts` | Logging and debug mode (`DEBUG=1`, `--debug`). | `logger`, `setDebugMode`, `isDebugEnabled` |

### Handler order

`registerBuiltinHandlers` (`src/sources/handlers/index.ts`) registers, in this order:
1. `github` template (`template: true`)
2. `deepwiki` template (`template: true`)
3. `docs-site`
4. `site-index`
5. `documents`
6. `single-page`

The order matters for detection. Templates are checked before the generic handlers, so a GitHub URL is not treated as a plain page. Check `registerBuiltinHandlers` before changing it.

---

## 3. A crawl, step by step

`main()` in `src/index.ts` (line 208). Simplified:

1. **Config.** Set debug mode. Resolve the database path (`./docs.db` by default) and the output directory (`resolveOutputDir`).
2. **Open the index.** `new VisitedDatabase(finalDbPath)` creates the `sources` and `visited_urls` tables if needed (`src/storage/database.ts`).
3. **Start the browser.** `new BrowserManager()` is used for pages that need JavaScript.
4. **Plan the layout** (default `--layout nav`). `planNavLayout` (`src/index.ts`, line 533) runs the nav extractors on the start page. `planLayout` (`src/nav/layout.ts`) turns the nav tree into numbered folders.
5. **Crawl.** `CrawlerQueue` processes URLs with `--concurrency` workers. Each page is:
   - checked against scope (`isUrlInScope`);
   - skipped if already in `visited_urls` (resume), unless `--force`;
   - fetched, or rendered in the browser;
   - converted to Markdown (`MarkdownConverter`);
   - written by `FileStorage`, at the planned path when a layout plan exists;
   - recorded with `db.recordVisited`, including a content hash (`computeHash`).
6. **Write the tree.** `buildTreeJson` writes `_tree.json` when a nav plan exists.
7. **Summary.** `CrawlSummary` is returned, and the index records the source (`sources` table).

Logs at each step are visible with `--debug`. The debug output is the quickest way to see which step went wrong.

---

## 4. Data model

SQLite file `docs.db` (default). Created by `VisitedDatabase`. Postgres is used instead when `DATABASE_URL` is set. Both have the same two tables.

```sql
sources (
  slug         TEXT PRIMARY KEY,      -- from --slug, or extractDefaultSlug(startUrl)
  name         TEXT NOT NULL,         -- --name
  start_url    TEXT NOT NULL,
  description  TEXT,                  -- --description
  created_at   TEXT NOT NULL
)

visited_urls (
  url                 TEXT PRIMARY KEY,
  source_slug         TEXT NOT NULL REFERENCES sources(slug),
  relative_file_path  TEXT NOT NULL,  -- where the Markdown was written
  title               TEXT,
  downloaded_at       TEXT NOT NULL,
  content_hash        TEXT            -- computeHash(content)
)
```

Notes:
- `url` is the primary key, so one URL belongs to one source. Re-running a crawl with a different slug does not re-index the same URL.
- `content_hash` lets a re-crawl detect changed pages. Check `database.ts` for how it is used before relying on that behaviour.

---

## 5. Output layout

With `--layout nav` (default), output looks like this:

```
<output>/<slug>/
  _tree.json            # the planned tree: source, framework, nodes
  01-getting-started/
    01-introduction.md
    02-install.md
  02-guides/
    ...
```

Folders and files are numbered in sidebar order. Pages not in the nav are saved under a fallback path (`unlistedPath`, `src/nav/crawlLayout.ts`).

With `--layout url`, the path follows the URL.

The output root is chosen in this order (`src/storage/paths.ts`):
1. an explicit output directory (positional argument or `--out`);
2. `KNOWLEDGE_ROOT`, if set;
3. `/srv/knowledge/...` when `HOST_ENV=remote`;
4. `./output`.

---

## 6. The `detect` and `docdl` flow

`detect` (`src/cli/detect.ts`) is the planned front door for the `docdl` CLI.

1. `normalizeInputUrl` cleans the input.
2. `probe` fetches the page and reads frameworks and file links.
3. Each registered handler (in §2 order) returns zero or more `Finding`s. A finding has a `kind` (one of `FindingKind` in `src/sources/types.ts`), a `confidence`, a `summary`, a `command`, and a `runnable` flag.
4. `formatReport` prints them as text. `--json` prints the JSON shape documented in `AGENTS.md`.
5. `--run` executes the runnable findings. `--only` filters them by kind (`selectRunnable`).

Exit codes (from `AGENTS.md`): `0` ok, `1` unreachable, invalid or run failed, `2` nothing runnable.

`docdl analyse` and `docdl download` (planned, see `openspec/changes/docdl-cli/`) would wrap this, with an analysis cache. The cache is not built.

---

## 7. Extension points

### Add a navigation extractor (a new docs framework)
1. Create `src/nav/extractors/<name>.ts`. Export an object with an `id`, and a function that reads a page and returns a `NavNode[]`. Use an existing extractor such as `mkdocs.ts` as the template.
2. Register it with `registerExtractor` (see the bottom of an existing extractor file).
3. Import the file where the other extractors are loaded (`src/nav/extractors/index.ts`).
4. Add a test in `test/nav*.test.ts` using a saved HTML fixture under `test/fixtures/`.

### Add a source handler
1. Implement `SourceHandler` (`src/sources/types.ts`): an `id`, plus a method that returns findings for a probe.
2. Register it in `registerBuiltinHandlers` (`src/sources/handlers/index.ts`). Choose the position deliberately (see §2).
3. Test it with `test/sourceRegistry.test.ts` and `test/probe.test.ts` as models.

### Add a GitHub or DeepWiki template
Templates live in `src/sources/templates/` and are registered with `{ template: true }`. Repo-specific settings go in `src/nav/repoConfigs.ts`.

---

## 8. Configuration

| Variable | Used by | Effect |
|---|---|---|
| `DATABASE_URL` | `storage/database.ts` | Use Postgres instead of SQLite |
| `KNOWLEDGE_ROOT` | `storage/paths.ts` | Root for all output |
| `HOST_ENV=remote` | `storage/paths.ts` | Output to `/srv/knowledge/...` |
| `DEBUG`, `DDOCS_DEBUG`, `DOCDOWNLOADER_DEBUG` | `utils/logger.ts`, `ddocs` | Debug logging |
| `DOC_DL_LIVE_TESTS=1` | `npm run test:live` | Run network tests |
| Browser options | `crawler/browser.ts` (`browserLaunchOptions`) | Launch settings for Playwright |

Full list: `.env.example`. Do not commit real values.

---

## 9. Testing

- `npm test`: TypeScript build, then `node --test dist/test/*.js`. The suite has 168 tests across 22 test files (as of 2026-11-18, all passing).
- `npm run test:live`: the same suite with `DOC_DL_LIVE_TESTS=1`. `test/live.test.ts` runs against real sites. This has not been run on this machine yet.
- Fixtures are HTML files in `test/fixtures/`. Prefer a fixture over a live site for unit tests.

Which test covers which module: the file names match the module names. For example, `test/navFumadocs.test.ts` covers `src/nav/extractors/fumadocs.ts`.

---

## 10. Known limits

- The live test suite is not run regularly, so behaviour on current sites is unverified.
- The `docdl` CLI is designed but not built. See `openspec/changes/docdl-cli/tasks.md` (26 tasks, none done).
- Positional arguments are parsed in `parseCliArgs` (`src/index.ts`) with no dedicated test that checks their order. The rules are in `PROJECT-STATUS.md` §2.
- The launchers `ddocs` and `docs_dl` in `~/.local/bin` still point to an older copy outside this repo. See `PROJECT-STATUS.md` §3B.
- Two commits are not yet pushed: `d75c68e` and `5c5565c`.
