import { VisitedDatabase } from '../storage/database';

export class CrawlerQueue {
  private visited = new Set<string>();
  private queue: string[] = [];
  private db?: VisitedDatabase;
  private force: boolean;

  constructor(options?: { db?: VisitedDatabase; force?: boolean }) {
    this.db = options?.db;
    this.force = !!options?.force;
  }

  add(url: string): boolean {
    if (!this.visited.has(url)) {
      this.visited.add(url);
      this.queue.push(url);
      return true;
    }
    return false;
  }

  next(): string | undefined {
    return this.queue.shift();
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
} 