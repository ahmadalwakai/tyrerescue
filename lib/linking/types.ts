export interface LinkableEntity {
  url: string;
  title: string;
  keywords: string[];
  category: 'service' | 'location' | 'blog' | 'emergency' | 'comparison';
  priority: number; // 1-10 (10 = highest)
  minDistance?: number; // Minimum characters between same-entity links
}

export interface LinkContext {
  currentUrl: string;
  currentCategory: string;
  contentLength: number;
  existingLinks: string[];
}

export interface LinkSuggestion {
  url: string;
  anchor: string;
  position: number; // Character position in content
  relevanceScore: number; // 0-1
  reason: string;
}

export interface LinkingRules {
  maxLinksPerPage: number;
  minCharsBetweenLinks: number;
  maxSameAnchor: number;
  priorityCategories: string[];
}
