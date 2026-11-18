# Tasks

## 1. Install script and CLI skeleton

- [ ] 1.1 Add `scripts/install-docdl.sh` that copies `bin/docdl` into the bin directory (default `~/.local/bin`, or the argument given). Verify: running it twice in a temp HOME creates an executable `docdl` and prints the path.
- [ ] 1.2 Add `bin/docdl` with subcommand dispatch and a help menu listing the six subcommands. Verify: `docdl`, `docdl help` and `docdl --help` print the same menu; an unknown subcommand exits non-zero and prints the menu to stderr (test in `test/docdl-cli.test.ts`).
- [ ] 1.3 Add `docdl <subcommand> --help` output for each subcommand. Verify: each prints its usage line; covered by the same test file.
- [ ] 1.4 Implement `docdl config`. Create the config file from a template if missing, open it in `$EDITOR`, and print the path when `$EDITOR` is unset. Verify: test with a temp HOME and `EDITOR=true` that the file is created and the command exits 0; test with `EDITOR` unset that it exits non-zero and prints the path.

## 2. URL analysis

- [ ] 2.1 Implement `docdl analyse <url> [--json] [--refresh]` by calling the existing detect entry point (`dist/src/cli/detect.js`). Verify: `docdl analyse --json <url>` returns the same JSON as `npm run detect -- <url> --json` for a fixture URL.
- [ ] 2.2 Write the analysis cache: a JSON file per normalised URL under the Doc-DL state directory, with a timestamp. Verify: a second `analyse` call on the same URL does not run the probe (test with a stubbed probe that counts calls).
- [ ] 2.3 Add a 7-day TTL check and the `--refresh` flag. Verify: a cache entry older than the TTL is re-probed; `--refresh` always re-probes.

## 3. Download gated on analysis

- [ ] 3.1 Implement `docdl download <url>` so it loads or creates the analysis first, then runs the workflow named in the finding (`--run` of detect, or the `ddocs` route). Verify: with no cache, the analysis runs once and the download starts; with a cache, the probe is skipped.
- [ ] 3.2 Make `download` exit non-zero without starting a download when the analysis has no runnable finding. Verify: test with a fixture URL whose findings are all informational.

## 4. Extraction

- [ ] 4.1 Add `scripts/docling_extract.py`, which converts one PDF or Office file to Markdown with Docling and writes the output path. Verify: converting a small PDF fixture produces non-empty Markdown.
- [ ] 4.2 Implement `docdl extract <file|folder>` for Markdown, HTML and Docling-backed inputs, writing outputs to an output directory with a provenance header. Verify: a folder with one `.md`, one `.html` and one `.pdf` produces three outputs, each starting with the source path and timestamp.
- [ ] 4.3 Detect a missing Docling and fail with the install command, writing no partial output for that file. Verify: with `DOCLING_PYTHON` pointing at a Python without Docling, the PDF fails with the named error and no output file exists.
- [ ] 4.4 Skip inputs whose output is newer than the source. Verify: running extract twice on the same folder reports the second run as all skipped.

## 5. Ingestion

- [ ] 5.1 Add Markdown chunking in Node. Split on headings and cap chunk size from config. Verify: unit test that a document with three headings and an oversized section yields the expected chunk count and that each chunk records its source and index.
- [ ] 5.2 Implement `docdl ingest <file|folder>` that writes chunks as JSONL under the output directory. Verify: ingesting an extracted fixture writes a JSONL file where each line parses and has `source` and `index`.
- [ ] 5.3 Run `download` and `extract` for inputs with no extracted Markdown before chunking. Verify: ingesting a URL with no prior download triggers both steps once (test with stubs for each step).
- [ ] 5.4 Skip chunking for files whose content hash matches the last ingest. Verify: a second ingest of an unchanged file writes nothing new.
- [ ] 5.5 Add the destination adapter interface with the JSONL adapter only. Verify: with no remote configured, ingest completes and reports that no remote destination was used.

## 6. Documentation and wiring

- [ ] 6.1 Document the six commands (`download`, `analyse`, `config`, `extract`, `ingest`, `md-crawl`) and the config file in `README.md`. Verify: each command in the README matches its `--help` output.
- [ ] 6.2 Note in `ddocs` usage that `docdl` is the new front end and `ddocs` is unchanged. Verify: `ddocs` help output is otherwise identical to before.
- [ ] 6.3 Run `npm test` and confirm the new tests pass alongside the existing ones. Verify: `npm test` exits 0.

## 7. Markdown site crawl

- [ ] 7.1 Add a discovery function that collects same-host `.md` URLs from `sitemap.xml`, `llms.txt`, and links on crawled pages, limited to the start URL's path prefix. Verify: a fixture site with two `.md` links, one off-host link and one `.md` outside the prefix yields exactly the two in-scope URLs.
- [ ] 7.2 Implement `docdl md-crawl <url> [--list] [-c N] [--max-pages N]` using the discovery function and the existing download and delay settings. Verify: `--list` prints the discovered URLs and writes no files; a normal run writes one Markdown file per URL under the output layout used by `download`.
- [ ] 7.3 Skip URLs already recorded in `docs.db` and report how many were skipped. Verify: running md-crawl twice on the fixture site downloads nothing on the second run and reports the skipped count.
- [ ] 7.4 Respect robots.txt for every discovered URL. Verify: a URL disallowed by the fixture's robots.txt is listed as skipped and not fetched.
- [ ] 7.5 Exit non-zero with a message when no `.md` files are found. Verify: a fixture site with no Markdown links exits non-zero and writes nothing.
