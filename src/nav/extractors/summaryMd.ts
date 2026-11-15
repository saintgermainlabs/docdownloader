import { posix } from 'path';
import type { NavExtractor, ExtractInput } from '../registry';
import { NavNode } from '../types';
import { normalizeSeparators } from '../layout';
import { repoJoin } from '../repoConfigs';

const ITEM = /^(\s*)[-*+]\s+\[([^\]]+)\]\(([^)]*)\)/;
const HEADING = /^#{1,6}\s+(.+?)\s*$/;

function configOf(input: ExtractInput): string | undefined {
  return input.configPath ?? [...(input.repoFiles?.keys() ?? [])].find((p) => /(^|\/)SUMMARY\.md$/.test(p));
}

/** Reads an mdBook / GitBook `SUMMARY.md`: headings → separators, nested list items → folders. */
export const summaryMdExtractor: NavExtractor = {
  id: 'summary-md',
  matches: (input) => !!configOf(input) && !!input.repoFiles?.get(configOf(input)!),
  async extract(input) {
    const path = configOf(input);
    const text = path ? input.repoFiles?.get(path) : undefined;
    if (!path || !text) return [];
    const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);

    const root: NavNode[] = [];
    // Stack of [indent, children array]
    const stack: Array<{ indent: number; children: NavNode[]; node?: NavNode }> = [{ indent: -1, children: root }];
    let sawItem = false;

    for (const line of text.split('\n')) {
      const heading = line.match(HEADING);
      if (heading) {
        // A leading "# Summary" title is not a category.
        if (!sawItem && root.length === 0 && /^summary$/i.test(heading[1])) continue;
        stack.length = 1;
        root.push({ type: 'separator', name: heading[1], children: [] });
        continue;
      }
      const item = line.match(ITEM);
      if (!item) continue;
      sawItem = true;
      const indent = item[1].replace(/\t/g, '    ').length;
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1];
      // Promote a link to a folder when it gets children.
      if (parent.node && parent.node.type === 'link') {
        const promoted: NavNode = { type: 'folder', name: parent.node.name, url: parent.node.url, children: parent.children };
        const grand = stack[stack.length - 2].children;
        grand[grand.indexOf(parent.node)] = promoted;
        parent.node = promoted;
      }
      const target = item[3].trim();
      const node: NavNode = target
        ? { type: 'link', name: item[2], url: /^https?:\/\//.test(target) ? target : repoJoin(dir, target) }
        : { type: 'folder', name: item[2], children: [] };
      parent.children.push(node);
      stack.push({ indent, children: node.type === 'folder' ? node.children : [], node });
    }
    return normalizeSeparators(root);
  },
};
