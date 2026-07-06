/**
 * Tiingo — EOD prices, fundamentals, news, crypto.
 * Docs: https://api.tiingo.com/docs/general/overview
 * Activated when TIINGO_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_EOD_PRICES, TTL_FUNDAMENTALS } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'Tiingo';
const BASE_URL = 'https://api.tiingo.com';

function apiKey(): string {
  const k = process.env.TIINGO_API_KEY;
  if (!k) throw new Error(`[${LABEL}] TIINGO_API_KEY not set`);
  return k;
}

async function callTiingo(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'json');
  const result = await callProvider({
    provider: 'tiingo', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs,
    headers: { Authorization: `Token ${apiKey()}` },
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: LABEL, title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: LABEL, asOf: result.asOf, cached: result.cached,
  });
}

const eod = new DynamicStructuredTool({
  name: 'tiingo_eod_prices',
  description: 'End-of-day OHLCV prices from Tiingo for a US ticker.',
  schema: z.object({
    ticker: z.string(),
    start_date: z.string().describe('YYYY-MM-DD'),
    end_date: z.string().describe('YYYY-MM-DD'),
  }),
  func: async ({ ticker, start_date, end_date }) =>
    callTiingo(`/tiingo/daily/${ticker.toUpperCase()}/prices`, {
      startDate: start_date, endDate: end_date,
    }, TTL_EOD_PRICES, `${ticker.toUpperCase()} EOD ${start_date}..${end_date}`),
});

const fundamentals = new DynamicStructuredTool({
  name: 'tiingo_fundamentals',
  description: 'Company fundamentals (income statement, balance sheet, cash flow) from Tiingo.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) =>
    callTiingo(`/tiingo/fundamentals/${ticker.toUpperCase()}/statements`, {}, TTL_FUNDAMENTALS, `${ticker.toUpperCase()} fundamentals`),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.TIINGO_API_KEY) return null;
  return [eod, fundamentals];
}