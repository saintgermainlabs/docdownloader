import TurndownService from 'turndown';

/**
 * HTML to Markdown converter using Turndown with customized clean rules.
 *
 * @remarks
 * Strips script tags, inline CSS, nav/footer elements, tracking attributes,
 * and unwanted JSON/CSS noise patterns (`:root`, `try {`, `{"props":`).
 *
 * @example
 * ```typescript
 * const converter = new MarkdownConverter();
 * const markdown = converter.convert('<h1>Title</h1><p>Hello world</p>');
 * ```
 */
export class MarkdownConverter {
  private turndown: TurndownService;

  /**
   * Initializes Turndown instance with fenced code block and clean HTML replacement rules.
   */
  constructor() {
    this.turndown = new TurndownService({
      codeBlockStyle: 'fenced',
      headingStyle: 'atx',
      bulletListMarker: '-',
      hr: '---'
    });

    this.turndown.addRule('removeStyles', {
      filter: ['style'],
      replacement: () => ''
    });

    this.turndown.addRule('removeScripts', {
      filter: ['script'],
      replacement: () => ''
    });

    this.turndown.addRule('pre', {
      filter: 'pre',
      replacement: (content, node) => {
        const element = node as HTMLElement;
        const language = element.className?.replace('language-', '') || '';
        return `\n\`\`\`${language}\n${content.trim()}\n\`\`\`\n`;
      }
    });

    this.turndown.addRule('links', {
      filter: 'a',
      replacement: (content, node) => {
        const element = node as HTMLAnchorElement;
        const href = element.href;
        return href ? `[${content}](${href})` : content;
      }
    });

    this.turndown.addRule('images', {
      filter: 'img',
      replacement: (content, node) => {
        const element = node as HTMLImageElement;
        const alt = element.alt || '';
        const src = element.src;
        return src ? `![${alt}](${src})` : '';
      }
    });

    this.turndown.remove(['nav', 'footer', 'aside', 'script', 'style', 'meta', 'iframe']);
  }

  /**
   * Converts an HTML string into formatted Markdown.
   *
   * @param html - Raw HTML content string.
   * @returns Cleaned Markdown output string.
   */
  convert(html: string): string {
    const cleanHtml = this.preProcessHtml(html);
    const markdown = this.turndown.turndown(cleanHtml);
    return this.postProcessMarkdown(markdown);
  }

  /**
   * Sanitizes raw HTML prior to Turndown conversion.
   *
   * @param html - Input HTML.
   * @returns Preprocessed HTML string.
   */
  private preProcessHtml(html: string): string {
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    html = html.replace(/ data-[^=]+="[^"]*"/g, '');
    html = html.replace(/ (class|id|style|onclick|onload|aria-[a-z]+)="[^"]*"/g, '');
    return html;
  }

  /**
   * Post-processes generated Markdown to strip unwanted code artifacts and normalize whitespace.
   *
   * @param markdown - Unprocessed Markdown string.
   * @returns Final cleaned Markdown string.
   */
  private postProcessMarkdown(markdown: string): string {
    const patternsToSkip = [
      ':root',
      'try {',
      '{"props":'
    ];

    return markdown
      .split('\n')
      .filter(line => {
        const trimmedLine = line.trim();
        return !trimmedLine || !patternsToSkip.some(pattern => trimmedLine.startsWith(pattern));
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/^[ \t]+(-|\*|\+|\d+\.) /gm, '$1 ')
      .replace(/```(\w*)\n\n/g, '```$1\n')
      .replace(/\n\n```/g, '\n```')
      .trim();
  }
}