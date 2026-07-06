/**
 * Marketaux — financial news with entity sentiment scores.
 * Docs: https://www.marketaux.com/documentation
 * Activated when MARKETAUX_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_NEWS } from '../finance/provider-call.js';
import { formatToolResult, parseSearchResults } from '../types.js';

const LABEL = 'Marketaux';
const BASE_URL = 'https://api.marketaux.com/v1/news/all';

function apiKey(): string {
  const k = process.env.MARKETAUX_API_KEY;
  if (!k) throw new Error(`[${LABEL}] MARKETAUX_API_KEY not set`);
  return k;
}

const news = new DynamicStructuredTool({
  name: 'marketaux_news',
  description: 'Financial news with per-entity sentiment scores from Marketaux (filter by ticker symbols).',
  schema: z.object({
    symbols: z.string().optional().describe('Comma-separated tickers, e.g. AAPL,MSFT'),
    query: z.string().optional().describe('Free-text search query'),
    days_back: z.number().int().min(1).max(30).default(3),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  func: async ({ symbols, query, days_back, limit }) => {
    const url = new URL(BASE_URL);
    url.searchParams.set('api_token', apiKey());
    url.searchParams.set('limit', String(limit));
    if (symbols) url.searchParams.set('symbols', symbols);
    if (query) url.searchParams.set('search', query);
    const publishedAfter = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();
    url.searchParams.set('published_after', publishedAfter);
    const result = await callProvider({
      provider: 'marketaux', endpoint: 'news_all',
      params: { symbols: symbols ?? '', query: query ?? '', days_back: String(days_back), limit: String(limit) },
      url: url.toString(), ttlMs: TTL_NEWS,
    });
    const { parsed, urls } = parseSearchResults(result.data);
    return formatToolResult(parsed, urls);
  },
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.MARKETAUX_API_KEY) return null;
  return [news];
}