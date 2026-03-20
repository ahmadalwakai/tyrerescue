import { ContentAnalyzer } from '@/lib/linking/analyzer';
import { LinkInjector } from '@/lib/linking/injector';
import type { LinkContext } from '@/lib/linking/types';

const analyzer = new ContentAnalyzer();
const injector = new LinkInjector();

/**
 * Processes raw blog-markdown HTML through the linking engine.
 * Call this *after* markdownToHtml() and *before* rendering via dangerouslySetInnerHTML.
 *
 * @param htmlContent  The HTML string produced by markdownToHtml()
 * @param rawContent   The original markdown/plain-text content (for analyser matching)
 * @param context      Page context (current URL, category, etc.)
 * @returns            HTML with smart internal links injected
 */
export function injectSmartLinks(
  htmlContent: string,
  rawContent: string,
  context: LinkContext,
): string {
  const suggestions = analyzer.analyze(rawContent, context);
  if (suggestions.length === 0) return htmlContent;
  return injector.injectLinks(htmlContent, suggestions);
}
