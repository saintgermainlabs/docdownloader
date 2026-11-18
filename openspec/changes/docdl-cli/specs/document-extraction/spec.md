# Spec Delta

## Purpose

Extraction turns downloaded or local files into LLM-readable Markdown, so later steps (chunking, RAG ingestion) work from text rather than from binary documents.

## ADDED Requirements

### Requirement: Extract converts files to Markdown
`docdl extract <file|folder>` SHALL write one Markdown file per input document into an output directory. Each output SHALL be readable as plain Markdown.

#### Scenario: PDF input
- **WHEN** the user runs `docdl extract` on a PDF file
- **THEN** a Markdown file with the document's text is written to the output directory

#### Scenario: Folder input
- **WHEN** the user runs `docdl extract` on a folder
- **THEN** every supported file in the folder is converted, and unsupported files are listed as skipped

#### Scenario: Markdown input
- **WHEN** the input is already Markdown
- **THEN** it is copied to the output directory without conversion

### Requirement: Document conversion uses Docling
PDF and Office inputs SHALL be converted with Docling. If Docling is not available, `extract` SHALL fail with a message that names the missing dependency and does not write partial output for that file.

#### Scenario: Docling missing
- **WHEN** Docling is not installed and the user extracts a PDF
- **THEN** the command fails with an error that names Docling, and no output file is written for that PDF

### Requirement: Extraction records provenance
Each extracted Markdown file SHALL record its source path and extraction time in a header, so the source can be traced.

#### Scenario: Provenance header
- **WHEN** a file is extracted
- **THEN** the output begins with a header naming the source file and the extraction timestamp
