# Spec Delta

## Purpose

Markdown crawl finds and downloads every Markdown file a documentation site makes available. It is for sites that publish `.md` files directly, rather than as rendered HTML pages.

## ADDED Requirements

### Requirement: Whole-site discovery of Markdown files
`docdl md-crawl <url>` SHALL search the site for `.md` files and collect every URL that ends in `.md` on the same host as the given URL. The search SHALL use the site's sitemap, its `llms.txt` file, and links found on same-host pages. The search SHALL be limited to the path prefix of the given URL.

#### Scenario: Files found through sitemap and links
- **WHEN** the user runs `docdl md-crawl` on a site whose sitemap and pages link to `.md` files
- **THEN** every same-host `.md` file under the path prefix is collected once

#### Scenario: Off-host and out-of-prefix files excluded
- **WHEN** the site links to a `.md` file on another host, or outside the path prefix
- **THEN** that file is not collected

### Requirement: Preview without downloading
`docdl md-crawl <url> --list` SHALL print the collected URLs and SHALL NOT write any file.

#### Scenario: List only
- **WHEN** the user runs `docdl md-crawl --list` on a site
- **THEN** the discovered URLs are printed, and no file is written to the output directory

### Requirement: Download of discovered files
Without `--list`, `md-crawl` SHALL download each collected file into the same output layout that `download` uses, and SHALL record each file in the index.

#### Scenario: Normal run
- **WHEN** the user runs `docdl md-crawl` on a site with three Markdown files
- **THEN** three Markdown files are written to the output directory and recorded in `docs.db`

### Requirement: Politeness and limits
`md-crawl` SHALL respect the site's robots.txt for every URL, SHALL use the existing concurrency and delay settings, and SHALL honour `--max-pages` when given.

#### Scenario: Disallowed URL
- **WHEN** a discovered URL is disallowed by robots.txt
- **THEN** the URL is reported as skipped and is not fetched

#### Scenario: Page limit
- **WHEN** the user passes `--max-pages 10` and the site has 50 Markdown files
- **THEN** at most 10 files are downloaded

### Requirement: Incremental runs
`md-crawl` SHALL skip URLs already recorded in the index and SHALL report how many were skipped.

#### Scenario: Second run
- **WHEN** the user runs `md-crawl` again on a site that was already crawled and nothing changed
- **THEN** no file is downloaded and the skipped count is reported

### Requirement: No Markdown found
When no `.md` file is found, `md-crawl` SHALL print a message and exit with a non-zero code, and SHALL write nothing.

#### Scenario: Empty result
- **WHEN** the site has no same-host `.md` links
- **THEN** the command exits non-zero with a message and writes no files
