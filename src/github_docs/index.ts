import { GithubDocsOptions } from './types';
import { downloadGithubDocs } from './downloader';

export function parseGithubCliArgs(argv: string[]): GithubDocsOptions {
  let repoUrl = '';
  let readme = true;
  let type: 'repo' | 'list' = 'repo';
  let listType = 'awesome';
  let tree: string | false = false;
  let dbPath = './docs.db';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--readme=')) {
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

if (require.main === module) {
  const options = parseGithubCliArgs(process.argv.slice(2));

  if (!options.repoUrl) {
    console.log(`
Usage: npm run github-docs -- <repoUrl> [options]

Arguments:
  <repoUrl>                      GitHub repository or tree URL (e.g. https://github.com/owner/repo)

Options:
  --readme=true|false             Download README.md to root of output directory (default: true)
  --type=repo|list                Specify storage structure: 'repo' or 'list' (default: repo)
  --list-type=<name>              Specify category directory when --type=list (default: awesome)
  --tree=<subpath>                Subfolder tree path to download recursively
  --db=<path>                     SQLite database path (default: ./docs.db)
`);
    process.exit(1);
  }

  downloadGithubDocs(options).catch((err) => {
    console.error('github_docs failed:', err.message);
    process.exit(1);
  });
}
