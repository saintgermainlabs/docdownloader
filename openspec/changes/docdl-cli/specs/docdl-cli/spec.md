# Spec Delta

## Purpose

The `docdl` command is the single installable entry point for Doc-DL. It exposes download, analysis, configuration, extraction and ingestion through one help-driven interface.

## ADDED Requirements

### Requirement: Installation
The install script SHALL place an executable `docdl` command in a bin directory on the user's PATH and report the location it used.

#### Scenario: Default install
- **WHEN** the user runs the install script with no arguments
- **THEN** `docdl` is installed into `~/.local/bin`, and the script reports the path

#### Scenario: Custom bin directory
- **WHEN** the user runs the install script with a bin directory argument
- **THEN** `docdl` is installed into that directory and no other location is changed

### Requirement: Help menu
`docdl` with no arguments, with `help`, or with `-h`/`--help` SHALL print the list of subcommands with a one-line description each.

#### Scenario: Help on no arguments
- **WHEN** the user runs `docdl` with no arguments
- **THEN** the help menu is printed and the exit code is 0

#### Scenario: Unknown subcommand
- **WHEN** the user runs `docdl` with an unknown subcommand
- **THEN** the help menu is printed to stderr and the exit code is non-zero

### Requirement: Subcommand dispatch
`docdl` SHALL accept the subcommands `download`, `analyse`, `config`, `extract`, `ingest` and `md-crawl`, and `docdl <subcommand> --help` SHALL describe that subcommand.

#### Scenario: Subcommand help
- **WHEN** the user runs `docdl extract --help`
- **THEN** the usage and options for `extract` are printed

### Requirement: Config command
`docdl config` SHALL open the Doc-DL configuration file in the user's `$EDITOR`, creating it from a template if it does not exist.

#### Scenario: Config file missing
- **WHEN** the user runs `docdl config` and no configuration file exists
- **THEN** a template configuration file is created and opened

#### Scenario: No editor set
- **WHEN** the user runs `docdl config` and `$EDITOR` is unset
- **THEN** the command prints the configuration file path and exits with a non-zero code
