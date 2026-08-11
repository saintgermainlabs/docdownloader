import { GithubDocsOptions } from './types';
import { downloadGithubDocs } from './downloader';

/**
 * Parses command-line arguments for the `github-docs` CLI command.
 *
 * @param argv - Array of command-line argument strings.
 * @returns Parsed {@link GithubDocsOptions} object.
 */
export function parseGithubCliArgs(argv: string[]): GithubDocsOptions {
  let repoUrl = '';
  let readme = true;
  let type: 'repo' | 'list' | undefined;
  let listType = 'awesome';
  let tree: string | false = false;
  let dbPath = './docs.db';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printGithubDocsHelp();
      process.exit(0);
    } else if (arg.startsWith('--readme=')) {
      readme = arg.split('=')[1] !== 'false';
    } else if (arg === '--no-readme' || arg === '--readme=false') {
      readme = false;
    } else if (arg === '--readme') {
      const val = argv[i + 1];
      if (val === 'true' || val === 'false') {
        readme = val === 'true';
        i++;
      } else {
        readme = true;
      }
    } else if (arg.startsWith('--type=')) {
      const val = arg.split('=')[1];
      if (val === 'list' || val === 'repo') {
        type = val;
      }
    } else if (arg === '--type' || arg === '-t') {
      const val = argv[++i];
      if (val === 'list' || val === 'repo') {
        type = val;
      }
    } else if (arg.startsWith('--list-type=')) {
      listType = arg.split('=')[1];
      type = 'list';
    } else if (arg === '--list-type') {
      listType = argv[++i];
      type = 'list';
    } else if (arg.startsWith('--tree=')) {
      tree = arg.split('=')[1];
    } else if (arg === '--tree') {
      tree = argv[++i];
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.split('=')[1];
    } else if (arg === '--db') {
      dbPath = argv[++i];
    } else if (arg === '--url') {
      repoUrl = argv[++i];
    } else if (!arg.startsWith('-') && !repoUrl) {
      repoUrl = arg;
    }
  }

  return { repoUrl, readme, type, listType, tree, dbPath };
}

/**
 * Prints comprehensive help information for the `github-docs` CLI command.
 */
export function printGithubDocsHelp(): void {
  console.log(`
github-docs CLI - Automatic GitHub Documentation & List Downloader

USAGE:
  npm run github-docs -- <repoUrl> [options]
  node dist/src/github_docs/index.js <repoUrl> [options]

ARGUMENTS:
  <repoUrl>                     GitHub repository or sub-tree URL
                                (e.g. https://github.com/aliaihub/awesome-hermes-usecases)

OPTIONS:
  --readme=true|false           Download root README.md file (default: true)
  --type=repo|list              Storage type: 'repo' or 'list' (auto-detected if URL contains 'awesome')
  --list-type=<name>            Category folder under output root for lists (default: awesome)
  --tree=<subpath>              Specific repository subfolder to download recursively
  --db=<path>                   SQLite database path (default: ./docs.db)
  --help, -h                    Display this help message

ENVIRONMENT VARIABLES:
  HOST_ENV=remote               Routes output to /srv/knowledge/documentation or /srv/knowledge/awesome

EXAMPLES:
  # Download repo automatically (auto-detects awesome list and subtrees):
  npm run github-docs -- https://github.com/aliaihub/awesome-hermes-usecases

  # Download specific subtree:
  npm run github-docs -- https://github.com/owner/repo --tree=docs

  # Remote environment execution:
  HOST_ENV=remote npm run github-docs -- https://github.com/facebook/react
`);
}

if (require.main === module) {
  const options = parseGithubCliArgs(process.argv.slice(2));

  if (!options.repoUrl) {
    printGithubDocsHelp();
    process.exit(1);
  }

  downloadGithubDocs(options).catch((err) => {
    console.error('github_docs failed:', err.message);
    process.exit(1);
  });
}
