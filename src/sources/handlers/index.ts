import { registerHandler, getHandler } from '../registry';
import { createDocsSiteHandler } from './docsSite';
import { singlePageHandler, documentsHandler, siteIndexHandler } from './simple';
import { createGithubTemplate } from '../templates/github';
import { deepwikiTemplate } from '../templates/deepwiki';

/** Registers the built-in handlers and templates (idempotent). */
export function registerBuiltinHandlers(): void {
  if (getHandler('docs-site')) return;
  registerHandler(createGithubTemplate(), { template: true });
  registerHandler(deepwikiTemplate(), { template: true });
  registerHandler(createDocsSiteHandler());
  registerHandler(siteIndexHandler);
  registerHandler(documentsHandler);
  registerHandler(singlePageHandler);
}
