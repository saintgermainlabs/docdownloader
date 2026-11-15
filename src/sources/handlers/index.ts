import { registerHandler, getHandler } from '../registry';
import { createDocsSiteHandler } from './docsSite';
import { singlePageHandler, documentsHandler, siteIndexHandler } from './simple';

/** Registers the built-in handlers and templates (idempotent). */
export function registerBuiltinHandlers(): void {
  if (getHandler('docs-site')) return;
  registerHandler(createDocsSiteHandler());
  registerHandler(siteIndexHandler);
  registerHandler(documentsHandler);
  registerHandler(singlePageHandler);
}
