export interface SourceRef {
  /** Stable numeric citation ID (assigned by the meta-tool router). */
  id: number;
  /** Source URL. */
  url: string;
  /** Provider name (e.g. "polygon", "fmp", "alphavantage"). */
  provider?: string;
  /** Optional human title for the source (filing name, headline, etc.). */
  title?: string;
}

export interface ToolResult {
  data: unknown;
  sourceUrls?: string[];
  /** Numbered source references for in-line `[1]` citation. */
  sources?: SourceRef[];
  /** ISO timestamp of when the underlying data was fetched (or served from cache). */
  asOf?: string;
  /** Provider name that produced the data. */
  provider?: string;
}

export function formatToolResult(data: unknown, sourceUrls?: string[]): string {
  const result: ToolResult = { data };
  if (sourceUrls?.length) {
    result.sourceUrls = sourceUrls;
  }
  return JSON.stringify(result);
}

/**
 * Format a ProviderResult-shaped call (with freshness metadata + a single
 * numbered source reference). Used by every meta-tool router so the agent
 * sees consistent provenance on every tool result.
 */
export function formatProviderResult(
  data: unknown,
  citationId: number,
  url: string,
  provider: string,
  asOf?: string,
  title?: string,
): string {
  const result: ToolResult = {
    data,
    sourceUrls: [url],
    sources: [{ id: citationId, url, provider, title }],
    provider,
  };
  if (asOf) result.asOf = asOf;
  return JSON.stringify(result);
}

/**
 * Parse search results from a search provider response.
 * Handles both string and object responses, extracting URLs from results.
 * Supports multiple response shapes from different providers.
 */
export function parseSearchResults(result: unknown): { parsed: unknown; urls: string[] } {
  // Safely parse JSON strings
  let parsed: unknown;
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result);
    } catch {
      // If parsing fails, treat the string as the result itself
      parsed = result;
    }
  } else {
    parsed = result;
  }

  // Extract URLs from multiple possible response shapes
  let urls: string[] = [];

  // Shape 1: { results: [{ url: string }] } (Exa format)
  if (parsed && typeof parsed === 'object' && 'results' in parsed) {
    const results = (parsed as { results?: unknown[] }).results;
    if (Array.isArray(results)) {
      urls = results
        .map((r) => (r && typeof r === 'object' && 'url' in r ? (r as { url?: string }).url : null))
        .filter((url): url is string => Boolean(url));
    }
  }
  // Shape 2: [{ url: string }] (direct array, Tavily format)
  else if (Array.isArray(parsed)) {
    urls = parsed
      .map((r) => (r && typeof r === 'object' && 'url' in r ? (r as { url?: string }).url : null))
      .filter((url): url is string => Boolean(url));
  }

  return { parsed, urls };
}
