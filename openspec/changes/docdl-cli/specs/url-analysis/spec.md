# Spec Delta

## Purpose

URL analysis identifies what kind of documentation a URL points to and which download workflow applies. It is the gate that `download` must pass through before fetching anything.

## ADDED Requirements

### Requirement: Analyse reports the page kind
`docdl analyse <url>` SHALL report the kind of content found at the URL and the workflow that `download` would run for each finding, using the existing detection logic.

#### Scenario: Docs site detected
- **WHEN** the user runs `docdl analyse` on a documentation site
- **THEN** the output names the kind (`docs-site`) and the workflow that would run

#### Scenario: Unsupported content
- **WHEN** the URL has no runnable workflow
- **THEN** the output says so and the exit code is non-zero

#### Scenario: Machine-readable output
- **WHEN** the user passes `--json`
- **THEN** the output is the JSON analysis result with a findings list

### Requirement: Download requires analysis
`docdl download <url>` SHALL run the analysis for that URL before any download. It SHALL use the workflow selected by the analysis.

#### Scenario: No prior analysis
- **WHEN** the user runs `docdl download <url>` and no analysis exists for the URL
- **THEN** the analysis runs first, its result is cached, and then the selected workflow runs

#### Scenario: Cached analysis
- **WHEN** the user runs `docdl download <url>` and a cached analysis exists for the URL
- **THEN** the cached analysis is used and the URL is not probed again

#### Scenario: Analysis finds nothing runnable
- **WHEN** the analysis returns no runnable finding
- **THEN** no download starts and the command exits with a non-zero code
