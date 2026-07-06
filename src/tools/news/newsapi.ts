/**
 * NewsAPI.org — search articles across 80,000+ sources.
 * Docs: https://newsapi.org/docs
 * Activated when NEWSAPI_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_NEWS } from '../finance/provider-call.js';
import { formatToolResult, parseSearchResults } from '../types.js';

const LABEL = 'NewsAPI';
const BASE_URL = 'https://newsapi.org/v2';

function apiKey(): string {
  const k = process.env.NEWSAPI_KEY;
  if (!k) throw new Error(`[${LABEL}] NEWSAPI_KEY not set`);
  return k;
}

const everything = new DynamicStructuredTool({
  name: 'newsapi_everything',
  description: 'Search every news article published in the last N days across 80k+ sources.',
  schema: z.object({
    query: z.string().describe('Free-text search query (e.g. "Apple earnings" or NVDA)'),
    days_back: z.number().int().min(1).max(30).default(7).describe('How many days back to search.'),
    page_size: z.number().int().min(1).max(100).default(20),
    language: z.string().default('en'),
  }),
  func: async ({ query, days_back, page_size, language }) => {
    const from = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = new URL(`${BASE_URL}/everything`);
    url.searchParams.set('q', query);
    url.searchParams.set('from', from);
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', String(page_size));
    url.searchParams.set('language', language);
    const result = await callProvider({
      provider: 'newsapi', endpoint: 'everything',
      params: { query, from, pageSize: String(page_size), language },
      url: url.toString(), ttlMs: TTL_NEWS,
      headers: { 'X-Api-Key': apiKey() },
    });
    const { parsed, urls } = parseSearchResults(result.data);
    return formatToolResult(parsed, urls);
  },
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.NEWSAPI_KEY) return null;
  return [everything];
}