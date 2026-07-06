/**
 * Twelve Data — global equities, FX, crypto, indices, fundamentals.
 * Docs: https://twelvedata.com/docs
 * Activated when TWELVE_DATA_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_INTRADAY_QUOTE, TTL_EOD_PRICES } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'Twelve Data';
const BASE_URL = 'https://api.twelvedata.com';

function apiKey(): string {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error(`[${LABEL}] TWELVE_DATA_API_KEY not set`);
  return k;
}

async function callTd(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey());
  const result = await callProvider({
    provider: 'twelvedata', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs,
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: LABEL, title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: LABEL, asOf: result.asOf, cached: result.cached,
  });
}

const timeSeries = new DynamicStructuredTool({
  name: 'twelvedata_time_series',
  description: 'OHLCV time series (intraday/daily/weekly/monthly) from Twelve Data.',
  schema: z.object({
    symbol: z.string().describe('Symbol like AAPL, EUR/USD, BTC/USD'),
    interval: z.enum(['1min','5min','15min','30min','1h','1day','1week','1month']).default('1day'),
    outputsize: z.number().int().min(1).max(5000).default(30),
  }),
  func: async ({ symbol, interval, outputsize }) =>
    callTd('/time_series', { symbol, interval, outputsize: String(outputsize) }, TTL_EOD_PRICES, `${symbol} ${interval}`),
});

const quote = new DynamicStructuredTool({
  name: 'twelvedata_quote',
  description: 'Latest quote (price, day change, volume) from Twelve Data.',
  schema: z.object({ symbol: z.string() }),
  func: async ({ symbol }) => callTd('/quote', { symbol }, TTL_INTRADAY_QUOTE, `quote ${symbol}`),
});

const fxRate = new DynamicStructuredTool({
  name: 'twelvedata_fx_rate',
  description: 'Latest FX exchange rate from Twelve Data (e.g. EUR/USD).',
  schema: z.object({ pair: z.string().describe('Currency pair like EUR/USD') }),
  func: async ({ pair }) => callTd('/exchange_rate', { symbol: pair }, TTL_INTRADAY_QUOTE, `FX ${pair}`),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.TWELVE_DATA_API_KEY) return null;
  return [timeSeries, quote, fxRate];
}