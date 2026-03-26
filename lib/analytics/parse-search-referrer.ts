export type ParsedSearchReferrer = {
  searchEngine: string | null;
  searchKeyword: string | null;
};

type SearchEngineMatch = {
  label: ParsedSearchReferrer['searchEngine'];
  hostPatterns: readonly string[];
};

const SEARCH_ENGINES: readonly SearchEngineMatch[] = [
  { label: 'Google', hostPatterns: ['google.'] },
  { label: 'Bing', hostPatterns: ['bing.com'] },
  { label: 'Yahoo', hostPatterns: ['yahoo.'] },
  { label: 'DuckDuckGo', hostPatterns: ['duckduckgo.com'] },
  { label: 'Ecosia', hostPatterns: ['ecosia.org'] },
];

const KEYWORD_PARAM_CANDIDATES = ['q', 'p', 'text', 'query', 'wd'] as const;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeKeyword(value: string | null): string | null {
  if (!value) return null;

  let decoded = value;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep original value when decoding fails
  }

  const compact = normalizeWhitespace(decoded.replace(/\+/g, ' '));
  return compact.length > 0 ? compact : null;
}

function detectSearchEngine(hostname: string): ParsedSearchReferrer['searchEngine'] {
  const host = hostname.toLowerCase();

  for (const engine of SEARCH_ENGINES) {
    if (engine.hostPatterns.some((pattern) => host.includes(pattern))) {
      return engine.label;
    }
  }

  return null;
}

export function parseSearchReferrer(referrerUrl: string): ParsedSearchReferrer {
  if (typeof referrerUrl !== 'string') {
    return { searchEngine: null, searchKeyword: null };
  }

  const trimmed = referrerUrl.trim();
  if (!trimmed) {
    return { searchEngine: null, searchKeyword: null };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { searchEngine: null, searchKeyword: null };
  }

  const searchEngine = detectSearchEngine(url.hostname);
  if (!searchEngine) {
    return { searchEngine: null, searchKeyword: null };
  }

  for (const paramName of KEYWORD_PARAM_CANDIDATES) {
    const keyword = normalizeKeyword(url.searchParams.get(paramName));
    if (keyword) {
      return { searchEngine, searchKeyword: keyword };
    }
  }

  return { searchEngine, searchKeyword: null };
}
