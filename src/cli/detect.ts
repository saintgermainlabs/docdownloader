#!/usr/bin/env node
import { probeUrl } from '../sources/probe';
import { detectAll } from '../sources/registry';
import { registerBuiltinHandlers } from '../sources/handlers';
import { Finding, Probe } from '../sources/types';

/** Parsed `detect` arguments. */
export interface DetectArgs {
  url: string;
  json: boolean;
  run: boolean;
  only?: string[];
  layout: 'nav' | 'url';
  /** Remaining arguments, forwarded to the workflow on `--run` (e.g. `-c 5 --force`). */
  passthrough: string[];
  help: boolean;
}

/** Parses `detect <url> [--json] [--run] [--only a,b] [--layout nav|url] [...passthrough]`. */
export function parseDetectArgs(argv: string[]): DetectArgs {
  const args: DetectArgs = { url: '', json: false, run: false, layout: 'nav', passthrough: [], help: false };
  const list = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--run') args.run = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--only') args.only = list(argv[++i]);
    else if (a.startsWith('--only=')) args.only = list(a.slice(7));
    else if (a === '--layout' || a.startsWith('--layout=')) {
      const v = a === '--layout' ? argv[++i] : a.slice(9);
      if (v === 'nav' || v === 'url') args.layout = v;
    } else if (!args.url && !a.startsWith('-')) args.url = a;
    else args.passthrough.push(a);
  }
  return args;
}

const KIND_LABEL: Record<string, string> = {
  'docs-site': 'Docs site',
  readme: 'README',
  'doc-folder': 'Doc folder',
  skills: 'Skills',
  wiki: 'Wiki',
  documents: 'Documents',
  page: 'Page',
  'llms-txt': 'llms.txt',
  sitemap: 'sitemap.xml',
  warning: 'Warning',
};

/** Renders the human-readable `detect` report. */
export function formatReport(probe: Probe, findings: Finding[]): string {
  const lines: string[] = [`${new URL(probe.finalUrl).hostname}  (${probe.finalUrl})`, ''];
  const recommended = findings.find((f) => f.runnable);
  for (const f of findings) {
    const label = (KIND_LABEL[f.kind] ?? f.kind).padEnd(16);
    lines.push(`${f.runnable ? '✔' : '•'} ${label} ${f.summary}`);
    if (f.runnable && f.command) {
      lines.push(`    → ${f.command}${f === recommended ? '   [recommended]' : ''}`);
    }
  }
  if (recommended) {
    lines.push('', `Run the recommended workflow:  doc-dl detect ${probe.url} --run`);
  }
  return lines.join('\n');
}

const USAGE = `doc-dl detect - find out what documentation a URL offers and how to download it

USAGE:
  doc-dl detect <url> [--json] [--run] [--only <kinds>] [--layout nav|url] [crawl options]

OPTIONS:
  --json              Machine-readable output: { url, findings }
  --run               Run the recommended workflow (all doc sets for GitHub repos)
  --only <kinds>      Comma-separated finding kinds to run (readme,doc-folder,skills,wiki,docs-site)
  --layout nav|url    Crawl layout when --run crawls a docs site (default: nav)
  -h, --help          Show this help

EXIT CODES:
  0 success   1 URL unreachable / invalid arguments   2 --run found nothing runnable`;

/** Injectable dependencies for {@link runDetect}. */
export interface DetectDeps {
  probe?: (url: string) => Promise<Probe>;
  detect?: (probe: Probe) => Promise<Finding[]>;
  out?: (text: string) => void;
}

/**
 * Runs the `detect` command.
 *
 * @returns Process exit code.
 */
export async function runDetect(argv: string[], deps: DetectDeps = {}): Promise<number> {
  const out = deps.out ?? ((t: string) => console.log(t));
  const args = parseDetectArgs(argv);
  if (args.help) {
    out(USAGE);
    return 0;
  }
  if (!args.url) {
    out(USAGE);
    return 1;
  }

  const probeFn = deps.probe ?? ((u: string) => probeUrl(u));
  const detectFn =
    deps.detect ??
    ((p: Probe) => {
      registerBuiltinHandlers();
      return detectAll(p);
    });

  let probe: Probe;
  try {
    probe = await probeFn(args.url);
  } catch (error: any) {
    out(`Error: ${error?.message ?? error}`);
    return 1;
  }
  const findings = await detectFn(probe);

  out(args.json ? JSON.stringify({ url: probe.finalUrl, findings }, null, 2) : formatReport(probe, findings));
  return 0;
}

if (require.main === module) {
  runDetect(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error?.message ?? error);
      process.exit(1);
    }
  );
}
