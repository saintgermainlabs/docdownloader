# Doc-DL Guide

A practical guide to what this package is, how it works, how to use it, and what needs to change to turn it into a standalone documentation downloader with plugins.

> Package name in `package.json`: `ai-doc-downloader` (also referred to as `docdownloader`, `doc-dl`, `ddocs`).
> Written 2026-11-15 from a scan of the source. Updated the same day after the public-release cleanup (portable paths, optional crawl output dir).

---

## 1. What it does

Doc-DL turns documentation into local Markdown files and keeps an index of what it downloaded.

| Mode | Input | What happens | Entry point |
|---|---|---|---|
| **Crawl** | A docs site URL | Headless Chromium renders each page (works on SPAs), converts HTML → Markdown, follows in-scope links | `src/index.ts` |
| **Clip** | One page URL | Extracts the `article`/`main` content of a single page, adds YAML frontmatter | `src/scripts/clip.ts` |
| **GitHub docs** | A GitHub repo URL | Uses the GitHub API to fetch `README` plus `docs/`, `usecases/`, `categories/` (or a chosen subtree) as raw files | `src/github_docs/` |
| **Skills** | A GitHub repo of agent skills | Finds `SKILL.md`-style folders and installs them into a `skills/` directory | `src/skills/` |
| **Batch** | `data/pending.yaml` / `.json` | Runs a crawl for each URL in the list | `src/scripts/processList.ts` |
| **Import** | A folder of existing `.md` files | Registers them in the index without downloading | `src/scripts/importDocs.ts` |

Every mode records results in an index database: SQLite (`./docs.db`) by default, or Postgres when `DATABASE_URL` is set.

---

## 2. Install

### End-user install (no sudo)

```bash
curl -fsSL https://raw.githubusercontent.com/saintgermainlabs/docdownloader/main/install.sh | bash
```

Needs `git`, `node >= 18`, `npm`. Clones to `${XDG_DATA_HOME:-~/.local/share}/doc-dl`, runs `npm ci && npm run build`, installs Playwright Chromium, and writes launchers for every `bin` entry into `~/.local/bin`. Re-run it to update; pass `--uninstall` to remove.

Overrides: `DOC_DL_REPO`, `DOC_DL_REF`, `DOC_DL_HOME`, `DOC_DL_BIN`, `DOC_DL_SKIP_BROWSERS=1`.

### Development install

```bash
npm install
npx playwright install chromium
npm run build
```

`mise.toml` pins Node 24, puts `./bin` on `PATH`, and defines tasks (`mise run build`, `mise run test`, …). Uncomment its `DEBUG` lines for verbose logs.

---

## 3. Command reference

There are three layers of commands. They all end up running the compiled JS in `dist/`.

```
docs_dl / ddocs (bash, bin/)  →  npm scripts  →  node dist/src/.../*.js
   Obsidian-aware wrappers        build + run       the actual CLIs
```

### 3.1 Crawl a docs site

```bash
node dist/src/index.js <url> [outputDir] [subfolder|website] [options]
npm start -- <url> [outputDir] [options]
ddocs crawl <url> [outputDir] [options]
```

`[outputDir]` is optional. Without it, output goes to `<base>/<slug>` (see §4), which is `./output/<slug>` by default. A scope keyword can come straight after the URL (`<url> website`).

| Option | Meaning | Default |
|---|---|---|
| `-c, --concurrency <N>` | Parallel browser pages | `1` |
| `-s, --scope <subfolder\|website>`, `--subfolder`, `--website` | `subfolder`: only URLs under the start path. `website`: whole origin | `subfolder` |
| `--name`, `--description`, `--slug` | Source metadata in the index | hostname / empty / derived from URL |
| `--db <path>` | SQLite file | `./docs.db` |
| `-f, --force` | Re-download pages already in the index | off |
| `-d, --debug` | Verbose logging | off (or env) |

Example:

```bash
npm start -- "https://docs.openclaw.ai/" --slug openclaw -c 5   # → ./output/openclaw/
```

### 3.2 Clip one page

```bash
npm run clip -- "<url>" [--out <dir>] [--filename <name>] [--title <t>] [--db <path>] [--no-db] [--debug]
```

Default file: `<knowledge-root>/clippings/<YYYY-MM-DD>-<slug>.md`. Recorded in the index under source slug `clippings` unless `--no-db`.

### 3.3 GitHub repository docs

```bash
npm run github-docs -- <repoUrl | owner/repo> [--tree=<subpath>] [--type=repo|list] [--list-type=<name>] [--readme=false] [--db=<path>]
```

- URL containing `awesome` → stored as a **list** (`<root>/awesome/<repo>/`), otherwise a **repo** (`<root>/<repo>/` under the docs base dir).
- Without `--tree` (and no `/tree/<branch>/<path>` in the URL), it downloads root dirs named `docs`, `usecases` or `categories`.
- Set `GITHUB_TOKEN` or `GH_TOKEN` to avoid the unauthenticated API rate limit.
- Source slug is always the repo name.

### 3.4 Agent skills

```bash
npm run skill -- <repoUrl> [--skill <name>] [--tree <subpath>] [--out <dir>] [--force] [--no-db] [--name] [--slug] [--db]
```

Looks for skills under `skills/`, `agent-skills/`, `.claude-plugin/skills`, `.gemini/skills`, `plugins/skills`, or the `--tree` you give. Skips files whose content is unchanged unless `--force`. Default output: `<knowledge-root>/skills`.

### 3.5 Batch

```bash
npm run process-list [-- --file=data/my_list.yaml] [--debug]
```

```yaml
urls:
  - https://tailscale.com/docs
  - url: https://docs.openclaw.ai/
    slug: openclaw
    scope: website        # any field of PendingItemOptions
    concurrency: 5        # batch default is 5
    outputDir: ./output/openclaw
```

When the input is YAML, it is also written out as `data/pending.json`. Items run one after another; a failing item is logged and skipped.

### 3.6 Import an existing folder

```bash
npm run import-docs -- --dir=output/coolify --slug=coolify --name="Coolify Docs" [--url=...] [--description=...] [--db=...]
```

### 3.7 Bash wrappers (`bin/`)

- **`docs_dl <url> [opts]`**: picks a mode automatically and writes into an Obsidian vault:
  1. GitHub URL containing `skill`/`skills`/`agent-skills` → skills
  2. Other GitHub URL → github-docs
  3. URL path containing `/docs`, `/documentation`, `/guide`, `/manual` → crawl
  4. Anything else → clip

  Flags: `-s/-c/-w/-g` force a mode; `-v <vault>`, `-j <N>`, `-t`, `-n`, `-f`, `-d`, `-o` (open in Obsidian).
- **`ddocs <command>`**: sub-command router: `dl`, `skill`, `clip`, `crawl`, `gh`, `batch`, `import`, `vault [info|open|ls]`, `build`, `test`. `ddocs <url>` is the same as `docs_dl <url>`.

Both rebuild `dist/` if it is missing, and work out the root in this order: `KNOWLEDGE_ROOT` → `OBSIDIAN_VAULT_PATH` → `obsidian` CLI → `~/obsidian-vaults/{agent/,}<vault>` → `~/Documents/Obsidian/<vault>` → `/srv/knowledge` (only when `HOST_ENV=remote`) → `$PWD/output`. The vault name comes from `OBSIDIAN_VAULT` (default `second-brain`).

---

## 4. Where files go

Output paths are resolved in `src/storage/paths.ts`. An explicit `--out`/`outputDir` always wins, except the literal values `./output` and `output`, which are treated as "not set".

**Knowledge root** (used for clippings and skills, and for docs when a vault is detected):

1. `KNOWLEDGE_ROOT`
2. `OBSIDIAN_VAULT_PATH`
3. `/srv/knowledge` if `HOST_ENV=remote`
4. `./output`

**Base dir by type:**

| Type | `KNOWLEDGE_ROOT` / `OBSIDIAN_VAULT_PATH` set | `HOST_ENV=remote` (no root set) | Default |
|---|---|---|---|
| docs (`repo`) | `<root>/Documentation` if it exists, else `<root>/Documents` | `/srv/knowledge/documentation` | `./output` |
| list | `<root>/<listType>` | `/srv/knowledge/<listType>` | `./output/<listType>` |
| clippings | `<root>/clippings` | `/srv/knowledge/clippings` | `./output/clippings` |
| skills | `<root>/skills` | `/srv/knowledge/skills` | `./output/skills` |

The final directory is `<base>/<slug>`. Crawled pages are saved by URL path: `/docs/a/b` → `<dir>/docs/a/b.md`, and `/` or a trailing slash → `index.md`.

**Slug derivation** (`extractDefaultSlug`): the first path segment that is not generic (`docs`, `api`, `en`, `v2`, `latest`, …), then a specific subdomain (`hermes-agent.nousresearch.com` → `hermes-agent`), then the full host for `docs.*` hosts, then the first host label.

---

## 5. The index database

`VisitedDatabase` (`src/storage/database.ts`) has an async API and two backends:

- **SQLite** (`better-sqlite3`) at `--db` path (default `./docs.db`), used when `DATABASE_URL` is unset.
- **Postgres** (`pg` Pool, e.g. Neon) when `DATABASE_URL` is set. The SQLite path is then ignored. `neon.ts` is the Neon project config.

Tables (created if they don't exist):

```
sources(slug PK, name, start_url, description, created_at)
visited_urls(url PK, source_slug → sources.slug, relative_file_path, title, downloaded_at, content_hash SHA-256)
```

Methods: `recordSource`, `getSource`, `getAllSources`, `hasVisited`, `getRecord`, `recordVisited`, `getAllVisited(slug?)`, `close`.

**Resume behaviour:** a crawl still opens pages already in `visited_urls`, so it can follow their links, but it does not convert or save them again unless `--force`.

```js
const { VisitedDatabase } = require('./dist/src/storage/database');
const db = new VisitedDatabase('./docs.db');
console.log(await db.getAllSources());
await db.close();
```

---

## 6. How the crawler works

```
seed URL → CrawlerQueue ─┬─ worker 1 ─┐
                         ├─ worker 2 ─┼─ BrowserManager.newPage()  (Playwright Chromium, headless)
                         └─ worker N ─┘      │ goto(domcontentloaded, 20s) + 200ms settle
                                             ├─ hasVisited? skip save
                                             ├─ MarkdownConverter.convert(page.content())
                                             ├─ FileStorage.saveMarkdown(url) → .md
                                             ├─ db.recordVisited(hash, title)
                                             └─ $$eval('a') → normalizeUrl → isUrlInScope → queue.add
```

- **Queue** (`crawler/queue.ts`): FIFO with an in-memory seen-set. Workers exit when the queue is empty and no worker is busy.
- **URL scope** (`crawler/urlUtils.ts`): always same-origin; fragments are stripped. `subfolder` matches a prefix of the start path (a start URL ending in a file name uses its parent directory).
- **Converter** (`converter/markdown.ts`): Turndown with ATX headings and fenced code (the language comes from `language-*` classes). It removes `nav`, `footer`, `aside`, `script`, `style`, `meta`, `iframe`, HTML comments, `data-*`/`class`/`id`/`style`/`aria-*` attributes, and lines starting with `:root`, `try {`, `{"props":`. The crawler converts the **whole page**; only clip narrows to `article`/`main`.
- **Logger** (`utils/logger.ts`): debug output is on when `--debug` is passed or any of `DEBUG`, `DDOCS_DEBUG`, `DOCDOWNLOADER_DEBUG`, `VERBOSE` is truthy.

---

## 7. Programmatic API

`dist/src/index.js` (the package `main`) exports:

```ts
main(startUrl, outputDir = './output', scope?, concurrency?, dbPath?, force?, name?, description?, slug?, debug?)
parseCliArgs(argv)
downloadGithubDocs({ repoUrl, readme?, type?, listType?, tree?, outputBaseDir?, dbPath? }) // → files saved
downloadSkill({ repoUrl, skillName?, tree?, outputDir?, slug?, name?, dbPath?, noDb?, force?, debug? }) // → SkillDownloadResult
resolveOutputDir, resolveSkillsDir, resolveClippingDir, resolveKnowledgeRoot
```

`clipPage`, `processList`, `importDocs` and `VisitedDatabase` are exported from their own modules (`dist/src/scripts/*`, `dist/src/storage/database`), not from the package root.

---

## 8. Known issues and gaps

Status of the test suite: **62/62 pass** (`npm test`, 2026-11-15).

Fixed in the public-release cleanup: hardcoded home-directory paths (now `./output` + env vars), the crawler's required `outputDir` (now optional, matching the docs and tests), `docs_dl` passing GitHub flags that were ignored, `DEBUG=1` on by default in `mise.toml`, leftover bootstrap files, and `@neon/config` as a runtime dependency (now a dev dependency).

Still open:

| # | Issue | Where |
|---|---|---|
| 1 | `relative_file_path` is not consistently relative. The crawler stores `join(outputDir, file)`, which is absolute when `outputDir` is absolute. GitHub/skills store a path relative to `cwd`. | `storage/fileSystem.ts`, `github_docs/downloader.ts` |
| 2 | HTTP status is not checked. 404/500 pages are converted and saved like any other page. | `src/index.ts` worker |
| 3 | No `robots.txt`, rate limiting, sitemap seeding, max-page/max-depth limit, or retry. | crawler |
| 4 | The crawler converts the full page rather than the main content. Clip already has `article`/`main` selection that could be shared. | `src/index.ts` vs `src/scripts/clip.ts` |
| 5 | `docs_dl` auto-detect sends any GitHub URL containing `skill` to the skills downloader. | `bin/docs_dl` |
| 6 | Obsidian-specific behaviour (vault lookup, `Documents/` vs `Documentation/`, `obsidian` CLI) still lives in core path logic and the bash wrappers. A plugin is the natural home. | `paths.ts`, `bin/*` |
| 7 | Names are inconsistent: npm `ai-doc-downloader`, repo `docdownloader`, install dir `doc-dl`, CLI `ddocs`. Pick one before publishing to npm. | `package.json`, `install.sh` |

---

## 9. Roadmap: standalone core + plugins

The code already splits along clear lines. A suggested target shape:

```
core (ai-doc-downloader)
  ├─ fetchers:     web-crawler (Playwright) · single-page · github
  ├─ converter:    HTML → Markdown (pluggable rules / content selectors)
  ├─ storage:      FileStorage (configurable layout) · Index (SQLite | Postgres)
  └─ config:       one resolver; output root from flag → env → config file → ./output
plugins
  ├─ obsidian      vault discovery, Documents/clippings/skills layout, `obsidian open`
  ├─ knowledge     HOST_ENV=remote → /srv/knowledge routing
  ├─ agent-skills  the current src/skills module
  └─ hermes        ddocs/docs_dl wrappers, SKILL.md
```

Suggested order:

1. ~~Fix the CLI contract~~ (done: `outputDir` is optional).
2. ~~Remove hardcoded paths~~ (done). Next: an optional config file (`doc-dl.config.{json,yaml}`), and move the vault and `/srv/knowledge` logic into plugins.
3. **Define a plugin interface**, for example hooks such as `resolveOutputDir`, `beforeConvert(html, url)`, `afterSave(record)`, and source handlers `canHandle(url)` / `download(url, ctx)`, so that `github`, `skills`, and future handlers (sitemaps, OpenAPI, PDFs) register themselves instead of being hard-wired into `docs_dl`.
4. **Crawler hardening**: status-code filtering, main-content selection shared with clip, limits, politeness, and retries.
5. **One CLI binary** (`doc-dl <url>` with sub-commands) written in TypeScript, replacing the two bash wrappers. Mode auto-detection moves into core and calls the source handlers.
6. **Packaging**: license, `files` whitelist, typings and `engines` are in place. Remaining: settle on one name, then publish to npm.

---

## 10. Source map

```
src/
  index.ts                  crawler CLI + main() + package exports
  crawler/browser.ts        Playwright Chromium lifecycle
  crawler/queue.ts          FIFO + seen-set (+ db-aware skip)
  crawler/urlUtils.ts       normalizeUrl, getSubfolderPath, isUrlInScope
  converter/markdown.ts     Turndown + cleanup rules
  storage/database.ts       VisitedDatabase (SQLite | Postgres), extractDefaultSlug, computeHash
  storage/fileSystem.ts     URL path → .md file
  storage/paths.ts          output/knowledge-root resolution
  github_docs/              GitHub API client, downloader, CLI
  skills/                   agent-skill discovery + installer, CLI
  scripts/clip.ts           single-page clipper
  scripts/processList.ts    batch runner
  scripts/importDocs.ts     folder → index importer
  utils/logger.ts           coloured step/debug logger
bin/ddocs, bin/docs_dl      bash wrappers (Obsidian-aware)
install.sh                  curl|bash installer/updater/uninstaller
test/                       node:test suites (run on compiled dist/)
docs/                       Sphinx config; TypeDoc via `npm run docs:typedoc`
```
