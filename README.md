# AI Doc Downloader (`docdownloader`)

A powerful TypeScript-based web crawler and documentation harvester that downloads web pages, Single Page Applications (SPAs), and GitHub repositories, converting them into clean Markdown files indexed in a unified SQLite database.

---

## Key Features

- **SPA & Dynamic Page Support**: Uses Playwright headless Chromium browser to render JavaScript-heavy sites.
- **HTML to Markdown Conversion**: Converts web content using Turndown with code block syntax highlighting and clean heading structures.
- **Unified SQLite Tracking (`./docs.db`)**: Centralized tracking database recording metadata (`sources` table) and visited pages (`visited_urls` table).
- **Crawl Resume Capabilities**: Skips re-downloading previously processed pages recorded in `./docs.db` while continuing child link discovery.
- **Parallel Worker Concurrency**: Scalable multi-worker concurrency controlled via `--concurrency` / `-c`.
- **Batch Processing (`npm run process-list`)**: Sequentially crawls a list of documentation URLs defined in `data/pending.yaml` or `data/pending.json`.
- **Single-page Clipping (`npm run clip`)**: Opens one URL in Playwright and saves cleaned Markdown under `clippings/`.
- **Agent Skill Downloader (`npm run skill`)**: Installs `SKILL.md`-style agent skills from a GitHub repo into a `skills/` folder.
- **Portable output layout**: Everything goes to `./output` by default; point it anywhere (e.g. an Obsidian vault) with `KNOWLEDGE_ROOT`.
- **Automatic GitHub Downloader (`npm run github-docs`)**:
  - Automatically detects `awesome` lists from repository URLs.
  - Fetches `README.md` to the root of the output directory.
  - Auto-discovers target tree folders (`docs`, `usecases`, `categories`) and downloads files into their respective subfolders.
- **Postgres option**: Set `DATABASE_URL` to keep the index in Postgres instead of SQLite.
- **Server preset (`HOST_ENV=remote`)**: Routes output to `/srv/knowledge/documentation` or `/srv/knowledge/awesome`.

---

## Install / Update / Uninstall

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/saintgermainlabs/docdownloader/main/install.sh | bash
```

Requires `git`, `node >= 18`, `npm` (no sudo, no Python). Installs the repo to
`${XDG_DATA_HOME:-$HOME/.local/share}/doc-dl`, runs `npm ci && npm run build`, installs Playwright
chromium, and writes launchers (`docs_dl`, `ddocs`, `docdownloader-clip`, `docdownloader-skill`) into `~/.local/bin`.

Overrides: `DOC_DL_HOME`, `DOC_DL_BIN`, `DOC_DL_REPO` (URL or local path), `DOC_DL_REF` (branch/tag/commit), `DOC_DL_SKIP_BROWSERS=1`.

### Update

Re-run the same one-liner (idempotent: fetches `DOC_DL_REF`, rebuilds, refreshes launchers).

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/saintgermainlabs/docdownloader/main/install.sh | bash -s -- --uninstall
```

Removes only launchers it created (marked `# doc-dl-launcher`) and the install dir.

## Installation (development)

```bash
# Clone the repository
git clone https://github.com/saintgermainlabs/docdownloader.git
cd docdownloader

# Install dependencies
npm install

# Install Playwright browser binaries
npx playwright install chromium

# Compile TypeScript
npm run build
```

---

## Usage Guide

### 1. Web Crawler (`npm start` or `node dist/src/index.js`)

```bash
# Crawl subfolder documentation (default)
npm start -- "https://docs.openclaw.ai/"

# Crawl with 5 concurrent workers
npm start -- "https://docs.openclaw.ai/" -c 5

# Specify custom source metadata
npm start -- "https://docs.openclaw.ai/" --name "OpenClaw Docs" --description "Official OpenClaw Documentation" --slug "openclaw" -c 5

# Force re-downloading previously visited pages
npm start -- "https://docs.openclaw.ai/" --force

# Enable verbose step-by-step debug logging
npm start -- "https://docs.openclaw.ai/" --debug -c 5
```

### 1.1 Debug Mode Configuration (`mise.toml`)

You can enable verbose step-by-step debug logging by setting `DEBUG = "1"` or `DDOCS_DEBUG = "1"` in `mise.toml`:

```toml
[env]
DEBUG = "1"
DDOCS_DEBUG = "1"
```

When enabled, the crawler prints detailed timestamped information for:
- Environment and configuration resolution (vault path, database file, output folders)
- Browser lifecycle (Chromium launch timing, process ID, version, context creation)
- Network and page lifecycle (HTTP status, DOM load time, console messages, network failures)
- HTML-to-Markdown conversion metrics and saved file paths
- Hyperlink discovery (evaluated links, in-scope vs out-of-scope reasons, queue state)
- Worker pool metrics and execution duration per page


### 2. Single-page Clipping (`npm run clip`)

```bash
# OpenClaw / agents: URL must come after --
npm run clip -- "https://docs.openclaw.ai/plugins/building-plugins"

# Default: ./output/clippings/<date>-<slug>.md
npm run clip -- "https://example.com/blog/post" --out ./clippings

# Remote: /srv/knowledge/clippings/
HOST_ENV=remote npm run clip -- "https://example.com/article" --title "Example Article"

# Binary (after npm run build && npm link):
docdownloader-clip "https://example.com/article"
```

### 3. Batch URL Processing (`npm run process-list`)

Define pending documentation URLs in `data/pending.yaml`:

```yaml
urls:
  - 'https://tailscale.com/docs'
  - 'https://docs.openclaw.ai/'
  - 'https://docmost.com/docs/'
```

Run the batch processor:

```bash
npm run process-list
```

This automatically converts `data/pending.yaml` to `data/pending.json` and crawls each entry sequentially into `./docs.db`.

### 4. Automated GitHub Downloader (`npm run github-docs`)

```bash
# Automatically download a GitHub repository (e.g. awesome list)
npm run github-docs -- "https://github.com/aliaihub/awesome-hermes-usecases"
```

- Automatically classifies repos containing `awesome` in the URL as `type: list`.
- Downloads `README.md` to root of output directory.
- Auto-discovers `docs`, `usecases`, or `categories` folders and downloads all files into their subdirectories.

### 5. Choosing where files go

By default everything is written under `./output`:

| Content | Default location |
|---|---|
| Crawled docs | `./output/<slug>/` |
| GitHub repo docs | `./output/<repo>/` (awesome lists: `./output/awesome/<repo>/`) |
| Clippings | `./output/clippings/` |
| Skills | `./output/skills/` |

Pass an output directory (positional or `--out`) to choose one explicitly, or set a root for everything:

```bash
# e.g. an Obsidian vault: docs go to <vault>/Documents/<slug>/ (or Documentation/ if it exists),
# clippings to <vault>/clippings/, skills to <vault>/skills/
export KNOWLEDGE_ROOT="$HOME/Notes/MyVault"
```

`OBSIDIAN_VAULT_PATH` works the same way. See [`.env.example`](.env.example) for all variables and [GUIDE.md](GUIDE.md) for the full resolution rules.

### 6. Server preset (`HOST_ENV=remote`)

Set `HOST_ENV=remote` to automatically direct outputs to `/srv/knowledge`:

```bash
# Saves standard docs to /srv/knowledge/documentation/<slug>/
HOST_ENV=remote npm start -- "https://tailscale.com/docs"

# Saves awesome lists to /srv/knowledge/awesome/<repoName>/
HOST_ENV=remote npm run github-docs -- "https://github.com/aliaihub/awesome-hermes-usecases"

# Saves clippings to /srv/knowledge/clippings/
HOST_ENV=remote npm run clip -- "https://example.com/article"

# Batch process list into /srv/knowledge/documentation/
HOST_ENV=remote npm run process-list
```

---

## SQLite Database Schema (`./docs.db`)

All downloaded pages and repository sources are recorded in `./docs.db`:

### `sources` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `slug` | `TEXT PRIMARY KEY` | Unique identifier (e.g., `openclaw`, `coolify`) |
| `name` | `TEXT` | Human-readable name |
| `start_url` | `TEXT` | Starting URL of the crawl |
| `description` | `TEXT` | Summary description of the documentation |
| `created_at` | `TEXT` | ISO 8601 creation timestamp |

### `visited_urls` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `url` | `TEXT PRIMARY KEY` | Webpage or GitHub blob URL |
| `source_slug` | `TEXT` | Foreign key referencing `sources(slug)` |
| `relative_file_path` | `TEXT` | Relative path to Markdown file on disk |
| `title` | `TEXT` | Extracted page or document title |
| `downloaded_at` | `TEXT` | ISO 8601 download timestamp |
| `content_hash` | `TEXT` | SHA-256 hash of Markdown content |

---

## Testing

Run unit and integration tests:

```bash
npm test
```

---

## Project Structure

```
.
├── src/
│   ├── crawler/        # Playwright browser manager, queue, & URL normalizer
│   ├── converter/      # HTML to Markdown converter
│   ├── github_docs/    # Automatic GitHub API downloader & tree scanner
│   ├── scripts/        # clip, processList & importDocs CLIs
│   ├── skills/         # Agent skill downloader
│   ├── storage/        # SQLite database manager & file system storage
│   └── index.ts        # Main crawler CLI entrypoint
├── bin/                # ddocs / docs_dl wrapper CLIs
├── data/               # Your pending URL lists (pending.yaml, git-ignored)
├── dist/               # Compiled JavaScript build output
├── test/               # Unit test suites
├── docs.db             # SQLite index (created on first run, git-ignored)
├── GUIDE.md            # In-depth guide
├── install.sh          # curl | bash installer
└── package.json
```

---

## License

[ISC](LICENSE)