import { Finding, Probe, SourceHandler } from './types';
import { logger } from '../utils/logger';

interface Entry {
  handler: SourceHandler;
  template: boolean;
  order: number;
}

let entries: Entry[] = [];

/**
 * Registers a source handler. Templates (known providers) win ties against generic handlers.
 * Re-registering an id replaces the earlier handler.
 */
export function registerHandler(handler: SourceHandler, opts: { template?: boolean } = {}): void {
  entries = entries.filter((e) => e.handler.id !== handler.id);
  entries.push({ handler, template: !!opts.template, order: entries.length });
}

/** Looks up a registered handler by id. */
export function getHandler(id: string): SourceHandler | undefined {
  return entries.find((e) => e.handler.id === id)?.handler;
}

/** Clears all registered handlers (for tests). */
export function resetRegistry(): void {
  entries = [];
}

/**
 * Asks every handler about the probe and returns findings ranked by confidence
 * (templates first on ties, then registration order). Handler errors are logged and skipped.
 */
export async function detectAll(probe: Probe): Promise<Finding[]> {
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const findings = await entry.handler.detect(probe);
        return findings.map((finding) => ({ finding, entry }));
      } catch (error: any) {
        logger.debug('DETECT', `Handler ${entry.handler.id} failed: ${error?.message ?? error}`);
        return [];
      }
    })
  );
  return results
    .flat()
    .sort(
      (a, b) =>
        b.finding.confidence - a.finding.confidence ||
        Number(b.entry.template) - Number(a.entry.template) ||
        a.entry.order - b.entry.order
    )
    .map((r) => r.finding);
}
