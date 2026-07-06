/**
 * EOD Historical Data — global equities EOD, fundamentals, splits/divs.
 * Docs: https://eodhd.com/financial-apis/new-real-time-data-api
 * Activated when EODHD_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_EOD_PRICES, TTL_FUNDAMENTALS } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'EODHD';
const BASE_URL = 'https://eodhd.com/api';

function apiKey(): string {
  const k = process.env.EODHD_API_KEY;
  if (!k) throw new Error(`[${LABEL}] EODHD_API_KEY not set`);
  return k;
}

async function callEodhd(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_token', apiKey());
  url.searchParams.set('fmt', 'json');
  const result = await callProvider({
    provider: 'eodhd', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs,
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: LABEL, title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: LABEL, asOf: result.asOf, cached: result.cached,
  });
}

const eod = new DynamicStructuredTool({
  name: 'eodhd_eod_prices',
  description: 'End-of-day OHLCV for any global exchange ticker from EODHD (format: TICKER.EXCHANGE).',
  schema: z.object({
    ticker: z.string().describe('Format: TICKER.EXCHANGE, e.g. AAPL.US or VOD.LSE'),
    start_date: z.string().describe('YYYY-MM-DD'),
    end_date: z.string().describe('YYYY-MM-DD'),
  }),
  func: async ({ ticker, start_date, end_date }) =>
    callEodhd(`/eod/${ticker.toUpperCase()}`, { period: 'd', from: start_date, to: end_date }, TTL_EOD_PRICES, `${ticker} EOD`),
});

const fundamentals = new DynamicStructuredTool({
  name: 'eodhd_fundamentals',
  description: 'Company fundamentals (highlights, valuation, income statement, balance sheet) from EODHD.',
  schema: z.object({ ticker: z.string().describe('Format: TICKER.EXCHANGE') }),
  func: async ({ ticker }) => callEodhd(`/fundamentals/${ticker.toUpperCase()}`, {}, TTL_FUNDAMENTALS, `${ticker} fundamentals`),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.EODHD_API_KEY) return null;
  return [eod, fundamentals];
}