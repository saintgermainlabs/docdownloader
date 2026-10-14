#!/usr/bin/env node
import { SkillDownloadOptions } from './types';
import { downloadSkill } from './downloader';
import { isDebugEnabled, setDebugMode, colors } from '../utils/logger';

/**
 * Parsed CLI options for the `skill` command.
 */
export interface SkillCliArgs extends SkillDownloadOptions {
  /** Whether help was requested */
  help: boolean;
}

/**
 * Parses command-line arguments for the `skill` CLI downloader.
 *
 * @param argv - Command-line argument strings.
 * @returns Parsed {@link SkillCliArgs} object.
 */
export function parseSkillCliArgs(argv: string[]): SkillCliArgs {
  let repoUrl = '';
  let skillName: string | undefined;
  let tree: string | undefined;
  let outputDir: string | undefined;
  let slug: string | undefined;
  let name: string | undefined;
  let dbPath = './docs.db';
  let noDb = false;
  let force = false;
  let help = false;
  let debug = isDebugEnabled();

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-d' || arg === '--debug' || arg === '--verbose') {
      debug = true;
    } else if (arg.startsWith('--debug=') || arg.startsWith('--verbose=')) {
      const val = arg.split('=')[1]?.toLowerCase();
      debug = val === 'true' || val === '1' || val === 'yes';
    } else if (arg === '-f' || arg === '--force') {
      force = true;
    } else if (arg === '--no-db') {
      noDb = true;
    } else if (arg === '--skill' || arg === '-s') {
      skillName = argv[++i];
    } else if (arg.startsWith('--skill=')) {
      skillName = arg.split('=')[1];
    } else if (arg === '--tree') {
      tree = argv[++i];
    } else if (arg.startsWith('--tree=')) {
      tree = arg.split('=')[1];
    } else if (arg === '--out' || arg === '--output' || arg === '-o') {
      outputDir = argv[++i];
    } else if (arg.startsWith('--out=') || arg.startsWith('--output=')) {
      outputDir = arg.split('=')[1];
    } else if (arg === '--name' || arg === '-n') {
      name = argv[++i];
    } else if (arg.startsWith('--name=')) {
      name = arg.split('=')[1];
    } else if (arg === '--slug') {
      slug = argv[++i];
    } else if (arg.startsWith('--slug=')) {
      slug = arg.split('=')[1];
    } else if (arg === '--db' || arg === '--database') {
      dbPath = argv[++i];
    } else if (arg.startsWith('--db=') || arg.startsWith('--database=')) {
      dbPath = arg.split('=')[1];
    } else if (arg === '--url') {
      repoUrl = argv[++i];
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  if (positionals.length > 0 && !repoUrl) {
    repoUrl = positionals[0];
  }
  if (positionals.length > 1 && !outputDir) {
    outputDir = positionals[1];
  }

  return {
    repoUrl,
    skillName,
    tree,
    outputDir,
    slug,
    name,
    dbPath,
    noDb,
    force,
    help,
    debug
  };
}

/**
 * Prints comprehensive help information for the `skill` CLI command.
 */
export function printSkillHelp(): void {
  console.log(`
${colors.bold('ddocs skill')} - Agent Skill Downloader for Obsidian Vaults & Second Brain

${colors.bold('USAGE:')}
  npm run skill -- <repoUrl> [options]
  node dist/src/skills/index.js <repoUrl> [options]

${colors.bold('ARGUMENTS:')}
  <repoUrl>                     GitHub repository URL, tree subpath, or owner/repo string
                                (e.g. https://github.com/kepano/obsidian-skills)

${colors.bold('OPTIONS:')}
  --skill, -s <name>            Download specific skill or rename single skill folder
  --tree <subpath>              Download specific repository subtree (e.g. skills/defuddle)
  --out, -o <path>              Custom destination directory (default: <vault>/skills)
  --force, -f                   Overwrite and re-download existing files
  --no-db                       Skip recording files into SQLite docs.db
  --db <path>                   Custom SQLite database path (default: ./docs.db)
  --name, -n <name>             Custom display name for source in database
  --slug <slug>                 Custom source slug identifier
  --debug, -d                   Enable verbose step-by-step debug logging
  --help, -h                    Display this help guide

${colors.bold('DEFAULT DESTINATIONS:')}
  Local Obsidian Vault:         /home/god/obsidian-vaults/agent/second-brain/skills/
  Remote Environment:           /srv/knowledge/skills/ (when HOST_ENV=remote)
  Custom Vault Override:        $OBSIDIAN_VAULT_PATH/skills or $KNOWLEDGE_ROOT/skills

${colors.bold('EXAMPLES:')}
  # Download all skills from repository into second-brain vault skills folder:
  npm run skill -- "https://github.com/kepano/obsidian-skills"

  # Download specific skill from repository:
  npm run skill -- "https://github.com/kepano/obsidian-skills" --skill=json-canvas

  # Download specific subtree:
  npm run skill -- "https://github.com/kepano/obsidian-skills/tree/main/skills/defuddle"

  # Force re-download with verbose debug logging:
  npm run skill -- "https://github.com/kepano/obsidian-skills" --force --debug
`);
}

if (require.main === module) {
  const options = parseSkillCliArgs(process.argv.slice(2));

  if (options.help || !options.repoUrl) {
    printSkillHelp();
    if (!options.repoUrl && !options.help) {
      process.exit(1);
    }
    process.exit(0);
  }

  if (options.debug) {
    setDebugMode(true);
  }

  downloadSkill(options).catch((err) => {
    console.error(colors.bold(colors.red(`\nSkill downloader failed: ${err.message}`)));
    if (isDebugEnabled() && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}
