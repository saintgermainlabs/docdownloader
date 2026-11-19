# Doc-DL: project status (as of 2026-11-18)

This note is for the spec work. It records what the code does today, what is finished, and what is still open. It was written from the repo at `main`'s working tree on `feat/openapi-template` and checked against `git log`, `npm test` and the OpenSpec change files. Facts are marked as checked where I ran or read them. Anything else is an assumption to confirm.

## 1. What the project is

`docdownloader` (package name `ai-doc-downloader`, folder `Doc-DL`) is a TypeScript CLI that:
- crawls documentation sites, including JavaScript-rendered ones, using Playwright (headless Chromium);
- converts pages to Markdown with Turndown;
- keeps the site's sidebar structure as folders with numbered files and a `_tree.json` map;
- records sources and visited pages in SQLite (`docs.db`), or in Postgres when `DATABASE_URL` is set;
- can download GitHub documentation folders, DeepWiki pages, and agent skills.

Runtime: Node 18+ and TypeScript. The install script puts it in `~/.local/share/doc-dl` and writes launchers (`docs_dl`, `ddocs`, `docdownloader-clip`, `docdownloader-skill`) into `~/.local/bin`.

Entry points, from `package.json` scripts (checked):

| Command | What it does |
|---|---|
| `npm start` | Main crawler (`src/index.ts`) |
| `npm run detect -- <url>` | Reports what docs a URL offers and how to download them; `--run` executes the recommended workflow |
| `npm run clip -- <url>` | Saves one page as clean Markdown under `clippings/` |
| `npm run github-docs` | Downloads doc folders and README from a GitHub repo |
| `npm run skill -- <repo>` | Installs `SKILL.md`-style agent skills from a GitHub repo |
| `npm run process-list` | Crawls every URL in `data/pending.yaml` or `data/pending.json` |
| `npm run import-docs` | Imports docs (see `src/scripts/importDocs.ts`) |
| `npm test` | Compiles and runs the unit tests |
| `npm run test:live` | Same, with `DOC_DL_LIVE_TESTS=1` (network tests, off by default) |

## 2. Done

### Verified today (checked)
- `npm test`: TypeScript builds, and **168 tests pass, 0 fail, 0 skipped**.
- Live tests (`npm run test:live`) were **not run**. They need network access and are off by default.
- Working tree was clean at the time of writing. No uncommitted changes.

### Completed features (from git history, 2026-08 to 2026-11)
- **Core crawler**: HTTP and Playwright rendering for SPAs, HTML to Markdown, duplicate skipping and resume using `docs.db`, parallel workers (`-c`), clip-to-Markdown.
- **Storage**: dual-mode index. Postgres via `DATABASE_URL`, with SQLite as the fallback (commit `7e0a193`, 2026-10-28).
- **Install and launchers**: `install.sh` supports install, update and uninstall via `curl | bash` (commit `c08816f`). Uninstall removes only launchers it created (marked `# doc-dl-launcher`).
- **Sidebar-tree layout**: default `--layout nav`. Numbered folders and `_tree.json`. Extractors for mkdocs, `SUMMARY.md`, Docusaurus and Fumadocs `meta.json` (commits `bfb8151`, `9882e83`, `1071e4c`, `b428edc`). The DOM-expansion fallback extractor and the optional system browser came in `b428edc`.
- **Source detection**: a handler registry (docs-site, page, documents, site-index), framework fingerprints, and `detect` with text and JSON output (`640c4bc`, `d937c1a`, `cbcb04a`). `detect --run` runs the recommended workflow (`3e7e9c2`).
- **Templates**: scan-first GitHub template (`8ede5f7`), DeepWiki via its MCP server (`aefde67`).
- **Fixes**: `clip` picks the largest main-content element; `detect` warns when no browser starts (`d75c68e`, unpushed).

### Positional arguments (current behaviour, checked in code)
These are the rules the code enforces today. The commit history does not show one commit called "positional arguments". The parsing code has been there since August and was changed later, so check the spec against the code rather than against a commit name.

- **`ddocs`/`docs_dl` and main crawler** (`src/index.ts`, around lines 95–190): `<url> [outputDir] [scope]`.
  - The first positional is always the URL.
  - Any later positional that is a scope keyword sets the scope. Keywords are `subfolder`, `sub`, `subpath` (anything else is not a scope).
  - Otherwise the first non-scope positional is the output directory.
  - A scope keyword can also come directly after the URL.
  - `--out` sets the output directory explicitly and takes priority over positional output.
  - If no output directory is given, the default root is used (`KNOWLEDGE_ROOT`, or `HOST_ENV=remote` for `/srv/knowledge/...`).
- **Skill downloader** (`src/skills/index.ts`, lines 33–83): `<repoUrl> [outputDir]`.
- **Clip** (`src/scripts/clip.ts`, lines 58–93): `<url>` as the first positional.

Open question: the README and AGENTS.md describe these rules, but there are no tests that check the positional order specifically. The spec should decide whether to add them.

## 3. Pending

### A. `docdl` CLI (OpenSpec change `docdl-cli`, not started)
Location: `openspec/changes/docdl-cli/` (`proposal.md`, `design.md`, `specs/`, `tasks.md`). **26 tasks, 0 done.** The proposal covers:
- An install script `scripts/install-docdl.sh` that copies `bin/docdl` into `~/.local/bin` (task 1.1).
- A `bin/docdl` dispatcher with a help menu listing six subcommands (task 1.2), plus per-subcommand `--help` (1.3).
- `docdl config`: create the config file from a template, open it in `$EDITOR` (1.4).
- `docdl analyse <url> [--json] [--refresh]`: calls the existing `detect` code (2.1). Results are cached per normalised URL with a 7-day TTL (2.2, 2.3).
- `docdl download <url>`: runs the analysis if needed, then the runnable workflow. It exits non-zero without downloading if nothing is runnable (3.1, 3.2).
- `docdl extract <file|folder>`: converts PDFs and Office files with Docling via `scripts/docling_extract.py`, writes a provenance header, and fails with the install command if Docling is missing (4.1–4.3).
- `ingest` and `md-crawl` subcommands (the rest of the tasks; see `tasks.md`).

Decisions the spec still needs to make (from the proposal, verify before relying on them):
- Whether the six subcommands are exactly `config`, `analyse`, `download`, `extract`, `ingest`, `md-crawl`.
- The Docling install path and Python environment (`DOCLING_PYTHON`).
- Where extracted and ingested files go, and whether that is the RAG store (open in the handoff).

### B. Repo and housekeeping
- **2 commits are not pushed**: `d75c68e` (clip and detect fixes) and `5c5565c` (OpenSpec change). Both are on `feat/openapi-template`.
- **Branch name**: the handoff says to rename `feat/openapi-template` to something more accurate. Not done.
- **Live tests have not been run** on this machine. Until they run, real-site behaviour is unverified.
- **Launchers**: `~/.local/bin/ddocs` and `docs_dl` symlink to an old copy at `~/dev/openclaw/projects/tools/docdownloader`, not to this repo. Repointing them is pending (and needs approval).
- **Old copies**: `~/dev/DocDownloader` (an unrelated third-party Python project) and the openclaw copy are still on disk. Retirement is pending.

### C. Known gaps and assumptions (confirm in the spec)
- No real-site run is recorded in the repo, so reliability on current doc sites is an assumption.
- The README and AGENTS.md describe the same features, but they have not been checked against each other line by line.
- The Quartz v5 clone used for clips sits at `~/dev/knowledge-tools/quartz` (branch `sg-labs-v5`). This is not part of Doc-DL.

## 4. Where to look

- Architecture, module map, data model and extension guide: [`ARCHITECTURE.md`](ARCHITECTURE.md).

- Code: `src/index.ts` (main CLI), `src/cli/detect.ts`, `src/sources/` (handlers), `src/nav/` (layout and extractors), `src/github_docs/`, `src/skills/`, `src/scripts/clip.ts`.
- Tests: `test/` (168 tests).
- Docs: `README.md`, `AGENTS.md`, `GUIDE.md`, `docs/` (TypeDoc output).
- Specs and plans: `openspec/`, plus the design docs in `docs/` from commit `cec9194`.
- Handoff: `~/Agents/universal-agent-workspace/.agents/handoffs/2026-11-18-claude-docdl-cli-planning.md`.
