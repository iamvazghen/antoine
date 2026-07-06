/**
 * Benzinga — market-moving news, ratings, calendar.
 * Docs: https://docs.benzinga.io/
 * Activated when BENZINGA_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_NEWS } from '../finance/provider-call.js';
import { formatToolResult, parseSearchResults } from '../types.js';

const LABEL = 'Benzinga';
const BASE_URL = 'https://api.benzinga.com/api/v2/news';

function apiKey(): string {
  const k = process.env.BENZINGA_API_KEY;
  if (!k) throw new Error(`[${LABEL}] BENZINGA_API_KEY not set`);
  return k;
}

const news = new DynamicStructuredTool({
  name: 'benzinga_news',
  description: 'Market-moving news with tickers and channels from Benzinga.',
  schema: z.object({
    tickers: z.string().optional().describe('Comma-separated tickers, e.g. AAPL,NVDA'),
    channels: z.string().optional().describe('Comma-separated channel ids (e.g. "news,earnings")'),
    days_back: z.number().int().min(1).max(30).default(3),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  func: async ({ tickers, channels, days_back, limit }) => {
    const url = new URL(BASE_URL);
    url.searchParams.set('token', apiKey());
    url.searchParams.set('pagesize', String(limit));
    if (tickers) url.searchParams.set('tickers', tickers);
    if (channels) url.searchParams.set('channels', channels);
    const from = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    url.searchParams.set('dateFrom', from);
    const result = await callProvider({
      provider: 'benzinga', endpoint: 'news',
      params: { tickers: tickers ?? '', channels: channels ?? '', days_back: String(days_back), limit: String(limit) },
      url: url.toString(), ttlMs: TTL_NEWS,
    });
    const { parsed, urls } = parseSearchResults(result.data);
    return formatToolResult(parsed, urls);
  },
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.BENZINGA_API_KEY) return null;
  return [news];
}