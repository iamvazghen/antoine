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

/**
 * Analyst rating changes. The Benzinga key already pays for the calendar
 * endpoints, and this is the one nothing else here covers: fmp_price_target
 * gives a consensus number with no history, whereas this is the actual stream
 * of upgrades, downgrades and price-target revisions with the firm named.
 */
const ratings = new DynamicStructuredTool({
  name: 'benzinga_analyst_ratings',
  description:
    'Analyst rating actions for a ticker from Benzinga: upgrades, downgrades, initiations and price-target revisions, each with the firm, the analyst, the prior and current target, and the date. Use when the question is about analyst sentiment shifts or where the Street stands, rather than a single consensus target.',
  schema: z.object({
    tickers: z.string().describe('Comma-separated tickers, e.g. "AAPL" or "AAPL,NVDA".'),
    days_back: z
      .number()
      .int()
      .min(1)
      .max(365)
      .default(90)
      .describe('How far back to look for rating actions.'),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  func: async ({ tickers, days_back, limit }) => {
    const url = new URL('https://api.benzinga.com/api/v2.1/calendar/ratings');
    url.searchParams.set('token', apiKey());
    url.searchParams.set('parameters[tickers]', tickers);
    url.searchParams.set('pagesize', String(limit));
    const from = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    url.searchParams.set('parameters[date_from]', from);

    const result = await callProvider({
      provider: 'benzinga',
      endpoint: 'calendar_ratings',
      params: { tickers, days_back: String(days_back), limit: String(limit) },
      url: url.toString(),
      ttlMs: TTL_NEWS,
    });

    const rows = (result.data as { ratings?: Array<Record<string, unknown>> }).ratings ?? [];
    // The raw rows carry ~30 fields each, most of them ids and duplicates.
    const actions = rows.map((r) => ({
      date: r.date,
      ticker: r.ticker,
      firm: r.analyst,
      analyst: r.analyst_name,
      action: r.action_company,
      rating_from: r.rating_prior,
      rating_to: r.rating_current,
      price_target_from: r.pt_prior,
      price_target_to: r.pt_current,
    }));
    return formatToolResult({ tickers, since: from, count: actions.length, actions }, [
      url.toString().replace(apiKey(), '***'),
    ]);
  },
});
export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.BENZINGA_API_KEY) return null;
  return [news, ratings];
}