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
- **Automatic GitHub Downloader (`npm run github-docs`)**:
  - Automatically detects `awesome` lists from repository URLs.
  - Fetches `README.md` to the root of the output directory.
  - Auto-discovers target tree folders (`docs`, `usecases`, `categories`) and downloads files into their respective subfolders.
- **Remote Environment Routing (`HOST_ENV=remote`)**: Routes output automatically to `/srv/knowledge/documents` or `/srv/knowledge/awesome`.

---

## Installation

```bash
# Clone the repository
git clone git@github.com:saintgermainlabs/docdownloader.git
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
```

### 2. Single-page Clipping (`npm run clip`)

```bash
# OpenClaw / agents: URL must come after --
npm run clip -- "https://docs.openclaw.ai/plugins/building-plugins"

# Local: /home/god/projects/knowledge/clippings/<date>-<slug>.md
npm run clip -- "https://docs.openclaw.ai/plugins/building-plugins"

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

### 5. Remote Environment Routing (`HOST_ENV=remote`)

Set `HOST_ENV=remote` to automatically direct outputs to `/srv/knowledge`:

```bash
# Saves standard docs to /srv/knowledge/documents/<slug>/
HOST_ENV=remote npm start -- "https://tailscale.com/docs"

# Saves awesome lists to /srv/knowledge/awesome/<repoName>/
HOST_ENV=remote npm run github-docs -- "https://github.com/aliaihub/awesome-hermes-usecases"

# Saves clippings to /srv/knowledge/clippings/
HOST_ENV=remote npm run clip -- "https://example.com/article"

# Batch process list into /srv/knowledge/documents/
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
│   ├── scripts/        # Batch processList & importDocs utility scripts
│   ├── storage/        # SQLite database manager & file system storage
│   └── index.ts        # Main crawler CLI entrypoint
├── data/               # Pending URL list files (pending.yaml / pending.json)
├── dist/               # Compiled JavaScript build output
├── test/               # Unit test suites
├── docs.db             # Unified SQLite database
├── package.json
├── tsconfig.json
├── requirements.txt    # System & package requirements
└── README.md
```

---

## License

ISC License.