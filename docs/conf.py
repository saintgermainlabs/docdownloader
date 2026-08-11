import os
import sys

project = 'ai-doc-downloader'
copyright = '2026, SaintGermainLabs'
author = 'SaintGermainLabs'
release = '1.0.0'

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.napoleon',
    'sphinx.ext.viewcode',
]

js_language = 'typescript'
js_source_path = '../src'
jsdoc_config_path = '../tsconfig.json'
typedoc_output_dir = 'build/typedoc.json'

templates_path = ['_templates']
exclude_patterns = ['_build', 'build', 'Thumbs.db', '.DS_Store']

html_theme = 'sphinx_rtd_theme'
html_static_path = ['_static']
