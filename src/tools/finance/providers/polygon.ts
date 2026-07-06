/**
 * Polygon.io — US stocks, options, FX, crypto. Docs: https://polygon.io/docs
 * Activated when POLYGON_API_KEY is set.
 *
 * Phase A: every call flows through `callProvider` for disk caching + freshness
 * stamps; the router above can prefer Polygon for real-time US quotes.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchJson } from '../utils.js';
import { callProvider, TTL_INTRADAY_QUOTE, TTL_EOD_PRICES } from '../provider-call.js';
import { formatToolResult } from '../../types.js';

const LABEL = 'Polygon API';
const BASE_URL = 'https://api.polygon.io';

function apiKey(): string {
  const k = process.env.POLYGON_API_KEY;
  if (!k) throw new Error(`[${LABEL}] POLYGON_API_KEY not set`);
  return k;
}

const stockSnapshot = new DynamicStructuredTool({
  name: 'polygon_stock_snapshot',
  description: 'Real-time US stock snapshot (last trade, day OHLC, volume) from Polygon.',
  schema: z.object({ ticker: z.string().describe('US stock ticker, e.g. AAPL') }),
  func: async ({ ticker }) => {
    const upper = ticker.toUpperCase();
    const url = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${upper}?apiKey=${apiKey()}`;
    const result = await callProvider({
      provider: 'polygon',
      endpoint: 'stock_snapshot',
      params: { ticker: upper },
      url,
      ttlMs: TTL_INTRADAY_QUOTE,
    });
    return JSON.stringify({
      data: result.data,
      sourceUrls: result.sourceUrls,
      sources: result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: result.provider })),
      provider: result.provider,
      asOf: result.asOf,
      cached: result.cached,
    });
  },
});

const stockAggregates = new DynamicStructuredTool({
  name: 'polygon_stock_aggregates',
  description: 'OHLCV aggregates over a date range from Polygon (resolution: day|hour|minute).',
  schema: z.object({
    ticker: z.string(),
    resolution: z.enum(['day', 'hour', 'minute']).default('day'),
    start_date: z.string().describe('YYYY-MM-DD'),
    end_date: z.string().describe('YYYY-MM-DD'),
  }),
  func: async ({ ticker, resolution, start_date, end_date }) => {
    const upper = ticker.toUpperCase();
    const path = `/v2/aggs/ticker/${upper}/range/1/${resolution}/${start_date}/${end_date}`;
    const url = `${BASE_URL}${path}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey()}`;
    const result = await callProvider({
      provider: 'polygon',
      endpoint: 'stock_aggregates',
      params: { ticker: upper, resolution, start_date, end_date },
      url,
      ttlMs: TTL_EOD_PRICES,
    });
    return JSON.stringify({
      data: result.data,
      sourceUrls: result.sourceUrls,
      sources: result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: result.provider })),
      provider: result.provider,
      asOf: result.asOf,
      cached: result.cached,
    });
  },
});

const forexSnapshot = new DynamicStructuredTool({
  name: 'polygon_forex_snapshot',
  description: 'Latest FX snapshot from Polygon (e.g. EURUSD).',
  schema: z.object({ pair: z.string().describe('Currency pair like EURUSD') }),
  func: async ({ pair }) => {
    const upper = pair.toUpperCase();
    const url = `${BASE_URL}/v1/last/currencies/${upper}?apiKey=${apiKey()}`;
    const result = await callProvider({
      provider: 'polygon',
      endpoint: 'forex_snapshot',
      params: { pair: upper },
      url,
      ttlMs: TTL_INTRADAY_QUOTE,
    });
    return JSON.stringify({
      data: result.data,
      sourceUrls: result.sourceUrls,
      sources: result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: result.provider })),
      provider: result.provider,
      asOf: result.asOf,
      cached: result.cached,
    });
  },
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.POLYGON_API_KEY) return null;
  return [stockSnapshot, stockAggregates, forexSnapshot];
}