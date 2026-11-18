# Spec Delta

## Purpose

Ingestion prepares extracted documents for retrieval-augmented generation: it splits them into chunks and hands the chunks to a configured destination.

## ADDED Requirements

### Requirement: Ingest chunks documents
`docdl ingest <file|folder>` SHALL split each extracted Markdown document into chunks and write the chunks as JSON Lines, with each chunk carrying its source path and position.

#### Scenario: Chunk output
- **WHEN** the user runs `docdl ingest` on an extracted Markdown file
- **THEN** a JSONL file of chunks is written, and each chunk records its source file and index

### Requirement: Ingest prepares missing inputs
`docdl ingest` SHALL run `download` and `extract` for any input whose extracted Markdown does not exist yet, before chunking.

#### Scenario: Input not downloaded
- **WHEN** the user ingests a URL whose documentation has not been downloaded
- **THEN** download and extract run first, and then the chunks are written

#### Scenario: Input already extracted
- **WHEN** the extracted Markdown already exists
- **THEN** download and extract are skipped and chunking starts directly

### Requirement: Configurable destination
Ingestion SHALL send chunks to the destination named in the configuration. The destination SHALL be an adapter, and at least the JSONL output SHALL work without a running service.

#### Scenario: JSONL only
- **WHEN** no RAG service is configured
- **THEN** ingestion completes by writing the JSONL chunks and reports that no remote destination was used

#### Scenario: Destination failure
- **WHEN** the configured destination rejects chunks
- **THEN** the command reports the failing chunk range and exits with a non-zero code, and chunks already accepted are not re-sent on the next run
