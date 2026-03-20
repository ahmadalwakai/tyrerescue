import type { LinkSuggestion } from './types';

/**
 * Injects `<a>` links into HTML content at positions identified by the analyser.
 *
 * Key safety rules
 * ────────────────
 * 1. Never inject inside an existing `<a>`, `<h1>`–`<h3>`, `<code>`, or `<pre>` tag.
 * 2. Never inject inside an HTML tag attribute (i.e. between `<` and `>`).
 * 3. Process suggestions from **last → first** so earlier positions remain valid.
 * 4. Wrap matched text with
 *    `<a href="…" class="smart-internal-link" data-relevance="…" title="…">…</a>`
 */
export class LinkInjector {
  /**
   * Inject all applicable suggestions into `htmlContent`.
   * Returns the modified HTML string.
   */
  injectLinks(htmlContent: string, suggestions: LinkSuggestion[]): string {
    if (suggestions.length === 0) return htmlContent;

    // Sort descending by position so splicing doesn't shift later indices
    const sorted = [...suggestions].sort((a, b) => b.position - a.position);

    let result = htmlContent;

    for (const suggestion of sorted) {
      result = this.injectSingle(result, suggestion);
    }

    return result;
  }

  /* ------------------------------------------------------------------ */

  private injectSingle(html: string, s: LinkSuggestion): string {
    const { url, anchor, position, relevanceScore } = s;

    // The position comes from the analyser which scanned the *original* content
    // (pre-HTML). After markdownToHtml the positions may have shifted slightly
    // because of wrapping `<p>`, `<h2>`, etc.  We search for the anchor text
    // near the estimated position within a generous window.
    const idx = this.findAnchorInHtml(html, anchor, position);
    if (idx === -1) return html;

    // Safety: check the anchor occurrence is not inside a forbidden tag
    if (this.isInsideForbiddenTag(html, idx)) return html;

    const tag =
      `<a href="${this.escapeAttr(url)}" class="smart-internal-link"` +
      ` data-relevance="${relevanceScore.toFixed(2)}"` +
      ` title="${this.escapeAttr(anchor)}">${html.slice(idx, idx + anchor.length)}</a>`;

    return html.slice(0, idx) + tag + html.slice(idx + anchor.length);
  }

  /* ------------------------------------------------------------------ */

  /**
   * Locate `anchor` in `html` closest to the expected `position`.
   * We search within ±800 chars of `position` (content grows due to tags).
   */
  private findAnchorInHtml(html: string, anchor: string, position: number): number {
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    let best = -1;
    let bestDist = Infinity;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(html)) !== null) {
      const dist = Math.abs(m.index - position);
      if (dist < bestDist) {
        bestDist = dist;
        best = m.index;
      }
    }

    // Accept if within reasonable drift tolerance
    return bestDist < 800 ? best : -1;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Returns `true` when `idx` falls inside an `<a>`, heading, code, or pre tag,
   * or inside a raw HTML tag attribute (`<tag … >`).
   */
  private isInsideForbiddenTag(html: string, idx: number): boolean {
    // 1. Inside a raw HTML attribute? (between < and >)
    const lastOpen = html.lastIndexOf('<', idx);
    const lastClose = html.lastIndexOf('>', idx);
    if (lastOpen > lastClose) return true; // we're inside a tag

    // 2. Inside <a>, <h1>–<h3>, <code>, <pre>?
    const forbiddenOpen =
      /<(a|h[1-3]|code|pre)[\s>]/gi;
    const forbiddenClose =
      /<\/(a|h[1-3]|code|pre)>/gi;

    // Scan for the most recent unclosed forbidden tag before `idx`
    const tags: { tag: string; pos: number; open: boolean }[] = [];
    let match: RegExpExecArray | null;

    forbiddenOpen.lastIndex = 0;
    while ((match = forbiddenOpen.exec(html)) !== null) {
      if (match.index >= idx) break;
      tags.push({ tag: match[1].toLowerCase(), pos: match.index, open: true });
    }

    forbiddenClose.lastIndex = 0;
    while ((match = forbiddenClose.exec(html)) !== null) {
      if (match.index >= idx) break;
      tags.push({ tag: match[1].toLowerCase(), pos: match.index, open: false });
    }

    // Sort by position
    tags.sort((a, b) => a.pos - b.pos);

    // Track open/close counts
    const stack: string[] = [];
    for (const t of tags) {
      if (t.open) {
        stack.push(t.tag);
      } else {
        const i = stack.lastIndexOf(t.tag);
        if (i !== -1) stack.splice(i, 1);
      }
    }

    return stack.length > 0;
  }

  /* ------------------------------------------------------------------ */

  private escapeAttr(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
