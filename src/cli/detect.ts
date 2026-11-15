#!/usr/bin/env node
import { probeUrl } from '../sources/probe';
import { detectAll, getHandler } from '../sources/registry';
import { registerBuiltinHandlers } from '../sources/handlers';
import { Finding, Probe, RunOptions, SourceHandler } from '../sources/types';

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

/**
 * Picks what `--run` executes: the best runnable finding; for a GitHub repo, every runnable
 * documentation set. `only` restricts the kinds considered.
 */
export function selectRunnable(findings: Finding[], only?: string[]): Finding[] {
  const runnable = findings.filter((f) => f.runnable && (!only || only.includes(f.kind)));
  const top = runnable[0];
  if (!top) return [];
  return top.handler === 'github' ? runnable.filter((f) => f.handler === 'github') : [top];
}

/** Maps passthrough arguments (`-c 5 --force -o dir --db x`) to handler run options. */
export function parseRunOptions(args: DetectArgs): RunOptions {
  const opts: RunOptions = { layout: args.layout, only: args.only };
  const p = args.passthrough;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = () => inline ?? p[++i];
    if (flag === '-c' || flag === '--concurrency') {
      const n = parseInt(value(), 10);
      if (n > 0) opts.concurrency = n;
    } else if (flag === '-f' || flag === '--force') opts.force = true;
    else if (flag === '-d' || flag === '--debug') opts.debug = true;
    else if (flag === '-o' || flag === '--out' || flag === '--output') opts.outputDir = value();
    else if (flag === '--db') opts.dbPath = value();
    else if (flag === '--layout') {
      const v = value();
      if (v === 'nav' || v === 'url') opts.layout = v;
    }
  }
  return opts;
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
  /** Handler lookup for `--run` (default: the registry). */
  handler?: (id: string) => SourceHandler | undefined;
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
  if (!args.run) return 0;

  const selected = selectRunnable(findings, args.only);
  if (!selected.length) {
    out('Nothing runnable was found for this URL.');
    return 2;
  }
  const top = findings.find((f) => !args.only || args.only.includes(f.kind));
  if (top && !top.runnable && top.kind === 'documents') {
    out(`Top finding (${top.kind}) needs Docling conversion, which is not supported yet; running ${selected[0].kind} instead.`);
  }

  const lookup = deps.handler ?? getHandler;
  const opts = parseRunOptions(args);
  let failed = false;
  for (const finding of selected) {
    const handler = lookup(finding.handler);
    if (!handler?.run) {
      out(`✖ ${finding.kind}: handler ${finding.handler} cannot run`);
      failed = true;
      continue;
    }
    out(`\n▶ Running ${finding.kind}: ${finding.url}`);
    try {
      const res = await handler.run(finding, opts);
      out(`✔ ${finding.kind}: ${res.filesWritten} file(s) → ${res.outputDir}`);
      for (const w of res.warnings) out(`  ! ${w}`);
    } catch (error: any) {
      out(`✖ ${finding.kind}: ${error?.message ?? error}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
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
