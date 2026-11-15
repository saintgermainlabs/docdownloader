# AGENTS.md - Agent Developer & Operating Guide

This guide provides instructions and technical specs for AI agents operating, consuming, or extending the `docdownloader` (`ai-doc-downloader`) package.

---

## 1. Overview & Capabilities

`docdownloader` is a TypeScript-based web crawler and documentation harvester designed for automated agent workflows.

### Core Capabilities
- **Playwright Headless SPA Scraping**: Renders JavaScript-heavy Single Page Applications (React, Vue, Docusaurus, Next.js).
- **HTML to Clean Markdown**: Strips tracking attributes, inline CSS, nav/footer elements, and noise artifacts (`:root`, `try {`, `{"props":`).
- **Unified SQLite Index (`./docs.db`)**: Tracks all sources and downloaded Markdown files across sessions.
- **Crawl Resume & Skipping**: Skips re-downloading pages recorded in `./docs.db` while continuing link discovery.
- **Parallel Workers**: Configurable concurrency via `-c <N>`.
- **Automatic GitHub Downloader (`github_docs`)**: Auto-classifies `awesome` lists, fetches `README.md`, and recursively downloads `docs/`, `usecases/`, or `categories/` folders.
- **Remote Environment Routing (`HOST_ENV=remote`)**: Directs outputs to `/srv/knowledge/documentation` or `/srv/knowledge/awesome`.

---

## 2. CLI Command Reference for Agents

All commands require TypeScript compilation (`npm run build` or `npm test`).

### 2.1 Web Crawler (`npm start`)

```bash
# Basic subfolder crawl
npm start -- "https://docs.openclaw.ai/"

# High-concurrency crawl (5 workers)
npm start -- "https://docs.openclaw.ai/" -c 5

# Custom source metadata and slug
npm start -- "https://docs.openclaw.ai/" --name "OpenClaw Docs" --description "OpenClaw AI Framework Docs" --slug "openclaw" -c 5

# Force re-downloading previously visited pages
npm start -- "https://docs.openclaw.ai/" --force

# Run with verbose step-by-step debug logging
npm start -- "https://docs.openclaw.ai/" --debug -c 5
```

### 2.2 Single-page clipping (`npm run clip`)

Opens one URL in Playwright, converts the main content to Markdown via `MarkdownConverter`, and writes a clipping file (with YAML frontmatter).

**OpenClaw / agents:** always pass the URL after `--` so npm forwards it to the script:

```bash
npm run clip -- "<URL>"
```

```bash
# Default: ./output/clippings/<date>-<slug>.md (or $KNOWLEDGE_ROOT/clippings)
npm run clip -- "https://docs.openclaw.ai/plugins/building-plugins"

# Remote knowledge tree: /srv/knowledge/clippings/
HOST_ENV=remote npm run clip -- "https://example.com/article" --title "Example Article"

# Custom output path / filename
npm run clip -- "https://example.com/post" --out ./clippings --filename my-note.md

# After build + npm link / install, binary is also available:
docdownloader-clip "https://example.com/article"
```

### 2.3 Automated GitHub Repository Downloader (`npm run github-docs`)

```bash
# Auto-detects awesome list vs standard repo & downloads root README + docs/usecases/categories subtrees
npm run github-docs -- "https://github.com/aliaihub/awesome-hermes-usecases"

# Download specific subtree only
npm run github-docs -- "https://github.com/owner/repo" --tree=docs
```

### 2.4 Batch URL List Processing (`npm run process-list`)

Configured in `data/pending.yaml` or `data/pending.json`:

```yaml
urls:
  - 'https://tailscale.com/docs'
  - 'https://docs.openclaw.ai/'
  - 'https://docmost.com/docs/'
```

Run batch crawler:
```bash
npm run process-list
```

### 2.5 Folder Import into SQLite (`npm run import-docs`)

```bash
npm run import-docs -- --dir=output/coolify --slug=coolify --name="Coolify Docs"
```

---

## 3. Environment Variable Behavior

No paths are hardcoded. Default output goes to `./output` (relative to the working directory).

| Variable | Effect |
|---|---|
| `KNOWLEDGE_ROOT` | Root for default output: `<root>/Documents/<slug>` (or `<root>/Documentation/<slug>` if that folder exists), `<root>/<listType>/<repo>`, `<root>/clippings`, `<root>/skills` |
| `OBSIDIAN_VAULT_PATH` | Same as `KNOWLEDGE_ROOT` (used if `KNOWLEDGE_ROOT` is unset) |
| `HOST_ENV=remote` | Server preset: root `/srv/knowledge`, docs in `/srv/knowledge/documentation/<slug>`, lists in `/srv/knowledge/awesome/<repo>`. `KNOWLEDGE_ROOT` still wins. |
| `DATABASE_URL` | Use Postgres instead of SQLite `./docs.db` |
| `GITHUB_TOKEN` / `GH_TOKEN` | Authenticated GitHub API calls (higher rate limit) |
| `DEBUG` / `DDOCS_DEBUG` | Verbose logging |
| `OBSIDIAN_VAULT` | Vault *name* used by the `ddocs` / `docs_dl` wrappers to find a vault (default `second-brain`) |

An explicit output directory (positional or `--out`) always wins over these. See `.env.example`.

---

## 4. Database Schema & Querying (`./docs.db`)

All crawlers index into `./docs.db` using `better-sqlite3`.

### Schema

#### `sources` Table
- `slug` (`TEXT PRIMARY KEY`) - Source identifier (e.g. `openclaw`, `coolify`)
- `name` (`TEXT`) - Display name
- `start_url` (`TEXT`) - Starting URL
- `description` (`TEXT`) - Summary description
- `created_at` (`TEXT`) - ISO 8601 timestamp

#### `visited_urls` Table
- `url` (`TEXT PRIMARY KEY`) - Webpage or raw GitHub file URL
- `source_slug` (`TEXT`) - References `sources(slug)`
- `relative_file_path` (`TEXT`) - File path on disk
- `title` (`TEXT`) - Extracted document title
- `downloaded_at` (`TEXT`) - ISO 8601 timestamp
- `content_hash` (`TEXT`) - SHA-256 hash of Markdown content

### Helpful Node.js Query Snippet for Agents

```javascript
const { VisitedDatabase } = require('./dist/src/storage/database');
const db = new VisitedDatabase('./docs.db');

// List all registered sources
console.log(db.getAllSources());

// List all files downloaded for a source
console.log(db.getAllVisited('openclaw'));
db.close();
```

---

## 5. Programmatic TypeScript API Usage

Agents can import and invoke modules directly in Node.js/TypeScript code:

```typescript
import { main } from './src/index';
import { downloadGithubDocs } from './src/github_docs/downloader';
import { VisitedDatabase } from './src/storage/database';

// 1. Run web crawler programmatically
await main(
  'https://docs.openclaw.ai/', // startUrl
  './output',                  // outputDir
  'subfolder',                 // scope ('subfolder' | 'website')
  5,                           // concurrency
  './docs.db'                  // dbPath
);

// 2. Download GitHub repo automatically
await downloadGithubDocs({
  repoUrl: 'https://github.com/aliaihub/awesome-hermes-usecases',
  dbPath: './docs.db'
});
```

---

## 6. Testing & Documentation Commands

```bash
# Run unit tests
npm test

# Build TypeDoc API HTML documentation
npm run docs:typedoc

# Build Sphinx HTML documentation
npm run docs:sphinx
```

---

## 7. Best Practices for Subagents

1. **Use Concurrency `-c 5`**: Always pass `-c 5` (or higher depending on machine resources) for significantly faster crawls.
2. **Rely on Resume Skipping**: Do not use `--force` unless explicitly requested to re-download existing pages. The default behavior checks `docs.db` and skips downloading existing documents while still extracting child links.
3. **URL Inputs for `github-docs`**: When handling GitHub URLs, pass only the URL to `npm run github-docs -- <url>`. The module will handle `awesome` classification, README fetching, and sub-tree discovery automatically.

---

## 8. Wrapper CLIs for agent integrations (`ddocs`, `docs_dl`)

The bash wrappers in `bin/` are the easiest surface for agent frameworks (e.g. Hermes, OpenClaw) to call:

```bash
ddocs <url>                       # auto-detect: skills repo / GitHub repo / docs crawl / single-page clip
ddocs crawl <url> --debug -c 5    # crawl with diagnostics
ddocs clip <url>                  # single page into <root>/clippings
ddocs vault info                  # show which knowledge root / Obsidian vault is used
```

Root lookup in the wrappers: `KNOWLEDGE_ROOT` → `OBSIDIAN_VAULT_PATH` → `obsidian` CLI (vault named `$OBSIDIAN_VAULT`) → `~/obsidian-vaults/{agent/,}<vault>` → `~/Documents/Obsidian/<vault>` → `/srv/knowledge` if `HOST_ENV=remote` → `$PWD/output`.

### Debugging
- If a crawl hangs on dynamic SPAs or unknown links, pass `--debug` to see timings, HTTP status codes and link scope decisions.
- With `DEBUG=1` (env or `mise.toml`) every stage logs: browser launch, navigation, DOM extraction, Markdown conversion, disk save and index writes.
