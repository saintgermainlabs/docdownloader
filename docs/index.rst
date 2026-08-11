AI Doc Downloader Documentation
=================================

Welcome to the documentation for **ai-doc-downloader** (`docdownloader`).

.. toctree::
   :maxdepth: 2
   :caption: Contents:

Overview
--------
`docdownloader` is a TypeScript-based web crawler and documentation harvester that downloads web pages, Single Page Applications (SPAs), and GitHub repositories, converting them into clean Markdown files indexed in a unified SQLite database (`./docs.db`).

Modules
-------
- **Crawler**: Headless Playwright browser manager, BFS queue, and URL normalization.
- **Converter**: HTML to Markdown conversion using Turndown.
- **Storage**: Unified SQLite database tracking and local/remote file storage.
- **GitHub Docs**: Automatic GitHub API repo tree scanner and downloader.
- **Batch Processing**: Sequential URL queue executor.

Indices and tables
==================
* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
