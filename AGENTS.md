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
- **Remote Environment Routing (`HOST_ENV=remote`)**: Directs outputs to `/srv/knowledge/documents` or `/srv/knowledge/awesome`.

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
```

### 2.2 Single-page clipping (`npm run clip`)

Opens one URL in Playwright, converts the main content to Markdown via `MarkdownConverter`, and writes a clipping file (with YAML frontmatter).

**OpenClaw / agents:** always pass the URL after `--` so npm forwards it to the script:

```bash
npm run clip -- "<URL>"
```

```bash
# Local: /home/god/projects/knowledge/clippings/<date>-<slug>.md
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

### `HOST_ENV`
- `HOST_ENV=remote`: Automatically sets output root to `/srv/knowledge`.
  - Repositories/Docs (`--type=repo`): `/srv/knowledge/documents/<slug>/`
  - Lists (`--type=list`): `/srv/knowledge/awesome/<slug>/`
  - Clippings (`npm run clip`): `<knowledge-root>/clippings/`
    (`/home/god/projects/knowledge/clippings` locally, `/srv/knowledge/clippings` when `HOST_ENV=remote`)
- `HOST_ENV` not set (Local): Docs/lists still use `./output/`; clippings always use the knowledge tree above.
- `KNOWLEDGE_ROOT`: Optional override for the knowledge root used by clippings.

Example for remote execution:
```bash
HOST_ENV=remote npm run github-docs -- "https://github.com/aliaihub/awesome-hermes-usecases"
```

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

## Learned User Preferences

- Default single-page clips to the knowledge `clippings` tree (local `…/knowledge/clippings`, remote `/srv/knowledge/clippings`), not under `./output/`.
- On remote hosts (`HOST_ENV=remote`), route docs to `documents/` and lists to `awesome/` (not a `documentation/` path).
- When invoking npm scripts from agents/OpenClaw, always pass the URL after `--` so npm forwards it.
- Keep executable tools under `/home/god/projects/tools`; knowledge may retain markdown pointers only, not tool code.

## Learned Workspace Facts

- This package lives at `/home/god/projects/tools/docdownloader` as a submodule of the private umbrella repo `saintgermainlabs/tools` (GitHub: `saintgermainlabs/docdownloader`).
- OpenClaw skills `download_documents` and `website_to_document` wrap this package from `/home/god/dev/tailnet/openclaw/skills/custom/` and sync to `/srv/openclaw/skills/custom/` on the live host.
- Skill routing for this tool: GitHub URLs → `npm run github-docs`; non-GitHub website crawl → `npm start`; single-page clip → `npm run clip` (clippings); `download_documents` targets the documents tree.
