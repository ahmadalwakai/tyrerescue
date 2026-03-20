import type { LinkableEntity, LinkSuggestion, LinkContext } from './types';
import { LINKABLE_ENTITIES, CATEGORY_WEIGHTS, LINKING_RULES } from './rules';

/**
 * Stateless content analyser.
 * Given a block of text and its page context it returns scored link suggestions
 * that respect all linking rules (max links, spacing, dedup, etc.).
 */
export class ContentAnalyzer {
  private entities: LinkableEntity[];

  constructor(entities?: LinkableEntity[]) {
    this.entities = entities ?? LINKABLE_ENTITIES;
  }

  /** Analyse plain-text / markdown content and return scored suggestions. */
  analyze(content: string, context: LinkContext): LinkSuggestion[] {
    const suggestions: LinkSuggestion[] = [];
    const contentLower = content.toLowerCase();
    const usedUrls = new Set<string>();
    const anchorCounts = new Map<string, number>();

    const sorted = this.sortEntities(context);

    for (const entity of sorted) {
      if (entity.url === context.currentUrl) continue;
      if (context.existingLinks.includes(entity.url)) continue;
      if (usedUrls.has(entity.url)) continue;

      const suggestion = this.bestMatchForEntity(
        entity,
        contentLower,
        content,
        context,
        suggestions,
        anchorCounts,
      );

      if (suggestion) {
        suggestions.push(suggestion);
        usedUrls.add(entity.url);
        const key = suggestion.anchor.toLowerCase();
        anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
      }

      if (suggestions.length >= LINKING_RULES.maxLinksPerPage) break;
    }

    return suggestions.sort((a, b) => a.position - b.position);
  }

  /* ------------------------------------------------------------------ */

  /** Try each keyword for a single entity and return the best match, or null. */
  private bestMatchForEntity(
    entity: LinkableEntity,
    contentLower: string,
    contentOriginal: string,
    context: LinkContext,
    existing: LinkSuggestion[],
    anchorCounts: Map<string, number>,
  ): LinkSuggestion | null {
    let best: LinkSuggestion | null = null;

    for (const keyword of entity.keywords) {
      // Escape regex-special chars in the keyword
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      let m: RegExpExecArray | null;

      while ((m = regex.exec(contentOriginal)) !== null) {
        const pos = m.index;

        // Enforce min distance between any two suggested links
        if (existing.some((s) => Math.abs(s.position - pos) < LINKING_RULES.minCharsBetweenLinks)) {
          continue;
        }

        // Enforce max same-anchor rule
        const anchorKey = m[0].toLowerCase();
        if ((anchorCounts.get(anchorKey) ?? 0) >= LINKING_RULES.maxSameAnchor) {
          continue;
        }

        const score = this.relevance(keyword, entity, context, pos, contentOriginal.length);
        if (score <= 0.3) continue;

        if (!best || score > best.relevanceScore) {
          best = {
            url: entity.url,
            anchor: m[0], // preserve original casing
            position: pos,
            relevanceScore: score,
            reason: `Matched "${keyword}" → ${entity.title}`,
          };
        }
      }

      // One keyword match per entity is enough; stop trying more keywords
      if (best) break;
    }

    return best;
  }

  /* ------------------------------------------------------------------ */

  private relevance(
    keyword: string,
    entity: LinkableEntity,
    context: LinkContext,
    position: number,
    contentLength: number,
  ): number {
    let score = 0;
    score += CATEGORY_WEIGHTS[entity.category] ?? 0.5;
    // Longer (more specific) keyword phrases score higher
    score += Math.min(keyword.split(' ').length * 0.1, 0.3);
    // Higher-priority entities get a boost
    score += (entity.priority / 10) * 0.2;
    // Boost if in the first 30 % of content
    if (position < contentLength * 0.3) score += 0.15;
    // Slight penalty for linking within the same category
    if (entity.category === context.currentCategory) score -= 0.1;
    return Math.min(Math.max(score, 0), 1);
  }

  /** Sort entities: prefer *different* categories first, then by priority. */
  private sortEntities(context: LinkContext): LinkableEntity[] {
    return [...this.entities].sort((a, b) => {
      const aDiff = a.category !== context.currentCategory ? 1 : 0;
      const bDiff = b.category !== context.currentCategory ? 1 : 0;
      if (aDiff !== bDiff) return bDiff - aDiff;
      return b.priority - a.priority;
    });
  }
}
