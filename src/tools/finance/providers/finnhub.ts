/**
 * Finnhub — real-time quotes, fundamentals, news, sentiment.
 * Docs: https://finnhub.io/docs/api
 * Activated when FINNHUB_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_INTRADAY_QUOTE, TTL_FUNDAMENTALS, TTL_NEWS } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'Finnhub';
const BASE_URL = 'https://finnhub.io/api/v1';

function apiKey(): string {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error(`[${LABEL}] FINNHUB_API_KEY not set`);
  return k;
}

function wrap(result: Awaited<ReturnType<typeof callProvider>>, providerName: string, title?: string): string {
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({
    id: i + 1, url: u, provider: providerName, title,
  }));
  return JSON.stringify({
    data: result.data,
    sourceUrls: result.sourceUrls,
    sources,
    provider: providerName,
    asOf: result.asOf,
    cached: result.cached,
  });
}

async function callFinnhub(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const upper: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) upper[k] = v.toUpperCase();
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(upper)) url.searchParams.set(k, v);
  url.searchParams.set('token', apiKey());
  const result = await callProvider({
    provider: 'finnhub', endpoint: path.slice(1).replace(/\//g, '_'),
    params: upper, url: url.toString(), ttlMs,
  });
  return wrap(result, LABEL, title);
}

const quote = new DynamicStructuredTool({
  name: 'finnhub_quote',
  description: 'Real-time stock quote (current, high, low, open, prev close) from Finnhub.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) => callFinnhub('/quote', { symbol: ticker }, TTL_INTRADAY_QUOTE, `quote ${ticker.toUpperCase()}`),
});

const profile = new DynamicStructuredTool({
  name: 'finnhub_company_profile',
  description: 'Company profile (name, country, currency, market cap, exchange, logo) from Finnhub.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) => callFinnhub('/stock/profile2', { symbol: ticker }, TTL_FUNDAMENTALS, `profile ${ticker.toUpperCase()}`),
});

const peers = new DynamicStructuredTool({
  name: 'finnhub_peers',
  description: 'List of peer companies for a ticker from Finnhub.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) => callFinnhub('/stock/peers', { symbol: ticker }, TTL_FUNDAMENTALS, `peers ${ticker.toUpperCase()}`),
});

const recommendation = new DynamicStructuredTool({
  name: 'finnhub_recommendation',
  description: 'Analyst recommendation trends (buy/hold/sell) from Finnhub.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) => callFinnhub('/stock/recommendation', { symbol: ticker }, TTL_FUNDAMENTALS, `recommendations ${ticker.toUpperCase()}`),
});

const sentiment = new DynamicStructuredTool({
  name: 'finnhub_sentiment',
  description: 'News sentiment aggregate for a ticker from Finnhub.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) => callFinnhub('/news-sentiment', { symbol: ticker }, TTL_NEWS, `sentiment ${ticker.toUpperCase()}`),
});

const earningsCalendar = new DynamicStructuredTool({
  name: 'finnhub_earnings_calendar',
  description: 'Upcoming earnings calendar from Finnhub (date, EPS estimate, revenue estimate, hour).',
  schema: z.object({
    from: z.string().describe('Start date YYYY-MM-DD'),
    to: z.string().describe('End date YYYY-MM-DD'),
    symbol: z.string().optional().describe('Optional: filter to a single ticker'),
  }),
  func: async ({ from, to, symbol }) => {
    const params: Record<string, string> = { from, to };
    if (symbol) params.symbol = symbol.toUpperCase();
    return callFinnhub('/calendar/earnings', params, TTL_FUNDAMENTALS, `earnings calendar ${symbol ?? 'all'}`);
  },
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.FINNHUB_API_KEY) return null;
  return [quote, profile, peers, recommendation, sentiment, earningsCalendar];
}

export const finnhubQuote = quote;
export const finnhubProfile = profile;
export const finnhubPeers = peers;
export const finnhubRecommendation = recommendation;
export const finnhubSentiment = sentiment;
export const finnhubEarningsCalendar = earningsCalendar;