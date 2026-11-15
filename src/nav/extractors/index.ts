import { registerExtractor } from '../registry';
import { fumadocsExtractor } from './fumadocs';
import { mkdocsExtractor } from './mkdocs';
import { summaryMdExtractor } from './summaryMd';
import { docusaurusExtractor } from './docusaurus';
import { fumadocsMetaExtractor } from './fumadocsMeta';
import { domExpandExtractor } from './domExpand';

// Order matters: framework-specific extractors first, generic fallbacks last.
registerExtractor(fumadocsExtractor);
registerExtractor(mkdocsExtractor);
registerExtractor(summaryMdExtractor);
registerExtractor(docusaurusExtractor);
registerExtractor(fumadocsMetaExtractor);
registerExtractor(domExpandExtractor); // generic fallback: must stay last
