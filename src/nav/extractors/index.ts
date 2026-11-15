import { registerExtractor } from '../registry';
import { fumadocsExtractor } from './fumadocs';

// Order matters: framework-specific extractors first, generic fallbacks last.
registerExtractor(fumadocsExtractor);
