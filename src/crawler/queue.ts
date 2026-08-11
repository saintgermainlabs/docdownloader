import { VisitedDatabase } from '../storage/database';

/**
 * Options for initializing a {@link CrawlerQueue}.
 */
export interface CrawlerQueueOptions {
  /** SQLite database instance for cross-session visited URL tracking */
  db?: VisitedDatabase;
  /** Force re-downloading URLs even if visited */
  force?: boolean;
}

/**
 * In-memory Breadth-First Search (BFS) queue for managing URL crawl state.
 *
 * @remarks
 * Tracks visited URLs within the current session to avoid duplicate enqueuing.
 */
export class CrawlerQueue {
  private visited = new Set<string>();
  private queue: string[] = [];
  private db?: VisitedDatabase;
  private force: boolean;

  /**
   * Constructs a new CrawlerQueue instance.
   *
   * @param options - Optional database tracking and force re-crawl settings.
   */
  constructor(options?: CrawlerQueueOptions) {
    this.db = options?.db;
    this.force = !!options?.force;
  }

  /**
   * Adds a URL to the crawl queue if it has not been queued in the current session.
   *
   * @param url - The absolute URL string to enqueue.
   * @returns True if the URL was added to the queue, false if it was already enqueued.
   */
  add(url: string): boolean {
    if (!this.visited.has(url)) {
      this.visited.add(url);
      this.queue.push(url);
      return true;
    }
    return false;
  }

  /**
   * Pops the next URL from the front of the FIFO queue.
   *
   * @returns The next URL string to process, or undefined if the queue is empty.
   */
  next(): string | undefined {
    return this.queue.shift();
  }

  /**
   * Checks if the queue is currently empty.
   *
   * @returns True if there are no pending URLs in the queue.
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}