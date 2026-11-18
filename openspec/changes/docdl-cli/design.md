# Design

## Context

Doc-DL is a TypeScript package (`ai-doc-downloader`) with compiled entry points in `dist/`. Detection lives in `src/cli/detect.ts` and `src/sources/` (`probe`, `registry`, handlers, templates). The `ddocs` bash wrapper in `bin/` already auto-detects and downloads. The index is `docs.db` (SQLite, metadata only). Document conversion for PDF and Office files does not exist yet: the `documents` handler reports them as "not yet supported". See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One installable `docdl` command with a help menu and the six subcommands.
- Reuse detection and download code. No second implementation of either.
- `download` cannot fetch a URL without an analysis result for it.
- Extraction and ingestion work from files on disk, so each step can be re-run alone.

**Non-Goals:**
- Choosing or deploying a vector database.
- Replacing `ddocs`, `docs_dl` or the npm scripts.
- Changing the `docs.db` schema or storing document content in it.
- Crawling new site types beyond what detection already supports.

## Decisions

**1. `docdl` is a bash script that calls the built Node entry points.**
The existing `ddocs` is bash, and `docdl` must be installable without a global npm link. The script resolves the Doc-DL install directory, then calls `node dist/src/cli/detect.js` for analysis and `node dist/src/index.js` or the `github-docs` entry point for download.
*Alternative:* a Node CLI with `bin` in `package.json`. Rejected because `npm link` and `prepublish` add setup steps, and the bash approach matches `ddocs`.

**2. Analysis is cached per URL under the Doc-DL state directory, not in `docs.db`.**
The analysis result is a JSON file keyed by a hash of the normalised URL. It is short-lived state and changing the index schema would affect the server deployment.
*Alternative:* a new `analyses` table in `docs.db`. Rejected to keep the index schema stable (see openspec/config.yaml).

**3. `download` runs `analyse` implicitly and caches the result.**
This satisfies "run analyse before download" without a second command step. The user can still run `docdl analyse` to see the result.
*Alternative:* refuse to download unless `analyse` was run first. Rejected as more friction for the same safety.

**4. Docling runs as an external Python process invoked by `extract`.**
Docling is a Python package. `extract` calls a small Python script under `scripts/` with a configured interpreter. The script writes Markdown; Node reads the result. This keeps Python out of the npm dependency tree.
*Alternative:* Node bindings for Docling. None are maintained, so this was not pursued.

**5. Chunking is done in Node, and ingestion writes JSONL by default.**
Chunks are plain JSON Lines so they are inspectable and easy to load into any RAG system. A remote destination is a named adapter in the config. JSONL needs no service.

**6. Each step records its inputs and skips work that is already done.**
`extract` skips files whose output is newer than the source. `ingest` skips chunking for files whose Markdown hash has not changed. The content hash already stored in `docs.db` is reused for this.

**7. `md-crawl` is its own discovery mode, not a branch of `analyse`.**
A Markdown-file search is a deliberate whole-site action, so it runs without the analysis gate. It reuses the existing link crawler and probe (sitemap and `llms.txt` reads) with a filter that keeps only `.md` URLs on the same host. Its files are written to the same output layout as `download` and indexed in `docs.db` under the same source slug, so duplicates are skipped by the existing URL and hash records.
*Alternative:* add a `md` finding kind to `analyse` and let `download` pick it up. Rejected because a whole-site search should not run on every URL that `analyse` looks at, and `--list` gives the preview that `analyse` cannot.

## Risks / Trade-offs

- **[Docling install is heavy and version-sensitive]** → `extract` checks for Docling at startup and fails with the install command. Pin the version in the install script.
- **[Cached analysis goes stale when a site changes]** → The cache stores a timestamp. `download` re-analyses when the cache is older than the configured TTL, and `docdl analyse --refresh` forces it.
- **[Bash script parsing of JSON output]** → The script uses `node -e` for JSON field reads rather than `jq`, so there is no extra dependency. Mitigation: tests cover the help and error paths.
- **[Two front ends (`docdl`, `ddocs`) can drift]** → Both call the same Node entry points. Behaviour changes go into Node code, not the bash scripts.

## Migration Plan

1. Add the install script and `docdl` with `help` and `config` first. These need no new dependencies.
2. Add `analyse` and the implicit analysis in `download`.
3. Add `extract`, including the Docling helper and its missing-dependency error.
4. Add `ingest` with JSONL output.
5. Rollback: remove the `docdl` file from the bin directory. Nothing else depends on it, and `ddocs` and `npm` are unchanged.

## Open Questions

- **Docling installation**: install into a dedicated venv under the Doc-DL state directory, or require the user to install it? Decide before step 3 of the migration plan. Does not change the specs.
- **RAG destination**: which system is the first remote adapter (the server RAG service at `rag.tiger-bushmaster.ts.net` is one candidate)? JSONL works without it, so this can wait.
- **Analysis cache location and TTL**: default to the Doc-DL state directory with a 7-day TTL. Can be changed in config later.
