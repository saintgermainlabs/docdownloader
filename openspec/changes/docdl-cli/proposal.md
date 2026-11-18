# Proposal

## Why

Doc-DL has the pieces for downloading documentation (`detect`, crawlers, the GitHub and DeepWiki templates) but only as separate npm scripts and the `ddocs` wrapper. There is no single installable command with a help menu, and nothing turns downloaded documents into LLM-readable Markdown or RAG-ready chunks. The Docling integration is planned but not built, so PDF and Office files are reported as "not yet supported". A single `docdl` command ties the existing workflow together and adds the missing extract and ingest steps.

## What Changes

- Add an install script that puts a `docdl` bash command into a bin folder (default `~/.local/bin`).
- Add `docdl` subcommands with a help menu:
  - `docdl download <url>`: downloads only the given URL. It runs the analysis first and uses the workflow the analysis selected.
  - `docdl analyse <url>`: reports what kind of page the URL is and which workflow `download` would run. Reuses the existing `detect` logic (`src/cli/detect.ts`, handlers in `src/sources/`). It is not reimplemented.
  - `docdl config`: opens the config file in `$EDITOR`.
  - `docdl extract <file|folder>`: converts documents into LLM-readable Markdown. Uses Docling for PDF and Office files. Markdown and HTML inputs are handled without Docling.
  - `docdl ingest <file|folder>`: chunks extracted Markdown and feeds it into a RAG workflow. Runs `download` and `extract` first when their outputs are missing.
  - `docdl md-crawl <url>`: searches the whole site for Markdown files (`.md`) and downloads them. Discovers files through the sitemap, `llms.txt`, and links on same-host pages, and does not depend on `analyse`.
- `docdl` is a new front end. The existing `ddocs`, `docs_dl` and `npm` entry points keep working unchanged.
- **Assumption (download gating)**: `download` runs `analyse` automatically when no analysis exists for the URL. It does not refuse to run. The analysis result is cached so repeat downloads do not re-probe. Override with `--no-analyse` is out of scope unless requested.
- **Assumption (Docling)**: Docling runs as an external Python tool called by `extract`. Its installation is handled by the install script or a documented step. It is not bundled in the npm package.
- **Assumption (md-crawl scope)**: `md-crawl` stays on the host of the given URL, optionally limited to the path prefix of that URL. It respects robots.txt and the existing concurrency and delay settings. It does not follow links to other hosts. `--list` shows the files found without downloading them.
- **Open question (RAG target)**: the ingest destination is not decided. This change writes chunks as JSONL and leaves the vector store as a configurable adapter. Choosing the real backend is out of scope.
- **BREAKING**: none.

## Capabilities

### New Capabilities

- `docdl-cli`: the installable `docdl` command, its subcommand dispatch, the help menu, the install script, and `docdl config`.
- `url-analysis`: the `docdl analyse` command and the rule that `download` runs analysis first. Wraps the existing detect logic.
- `document-extraction`: the `docdl extract` command. Converts PDF and Office files to LLM-readable Markdown through Docling, and passes Markdown and HTML through.
- `rag-ingestion`: the `docdl ingest` command. Chunks extracted Markdown, writes chunk output, and calls a configurable ingest adapter. Runs `download` and `extract` first when their outputs are missing.
- `markdown-crawl`: the `docdl md-crawl` command. Finds every same-host `.md` file reachable from a site and downloads it, with a `--list` preview.

### Modified Capabilities

None. No existing specs exist under `openspec/specs/`.

## Impact

- New files: `bin/docdl` (or a `docdl/` subfolder), an install script, a `docdl` config file template, and tests under `test/`.
- Reused code: `src/cli/detect.ts`, `src/sources/` handlers and registry, `src/storage/database.ts` (index metadata only, per `openspec/config.yaml`), `src/storage/fileSystem.ts`.
- Changed behavior: the `documents` finding in `src/sources/handlers/simple.ts` moves from "not yet supported" to a working Docling path once `extract` exists.
- Dependencies: Python plus Docling on the machine that runs `extract`. A chunking dependency is needed for `ingest`.
- Systems: no change to the server deployment (`HOST_ENV=remote`). The `docs.db` index keeps its schema for now.
