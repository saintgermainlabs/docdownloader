/**
 * A node in a documentation site's sidebar (navigation) tree.
 *
 * - `separator`: a non-clickable category label (e.g. "Get Started with"); owns the items after it.
 * - `folder`: an expandable group, optionally with its own page (`url`).
 * - `link`: a page.
 */
export type NavNode =
  | { type: 'separator'; name: string; children: NavNode[] }
  | { type: 'folder'; name: string; url?: string; children: NavNode[] }
  | { type: 'link'; name: string; url: string };

/** A sidebar node annotated with where (or whether) it is saved on disk. */
export interface PlannedTreeNode {
  type: NavNode['type'];
  name: string;
  url?: string;
  /** Relative path of the saved file (links, folder index pages) or directory (separators, folders). */
  path?: string;
  /** Path of the first occurrence when the same page appears more than once. */
  ref?: string;
  /** True when the link points outside the crawl scope and is not downloaded. */
  external?: true;
  children?: PlannedTreeNode[];
}

/** Result of planning a sidebar tree onto disk. */
export interface LayoutPlan {
  /** Normalized absolute URL → relative `.md` path. */
  paths: Map<string, string>;
  tree: PlannedTreeNode[];
}
