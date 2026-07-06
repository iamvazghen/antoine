/**
 * CoinMarketCap — listings, quotes, global metrics.
 * Docs: https://coinmarketcap.com/api/documentation/v1/
 * Activated when COINMARKETCAP_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_INTRADAY_QUOTE } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'CoinMarketCap';
const BASE_URL = 'https://pro-api.coinmarketcap.com/v1';

function apiKey(): string {
  const k = process.env.COINMARKETCAP_API_KEY;
  if (!k) throw new Error(`[${LABEL}] COINMARKETCAP_API_KEY not set`);
  return k;
}

async function callCmc(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const result = await callProvider({
    provider: 'coinmarketcap', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs,
    headers: { 'X-CMC_PRO_API_KEY': apiKey() },
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: 'coinmarketcap', title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: 'coinmarketcap', asOf: result.asOf, cached: result.cached,
  });
}

const listings = new DynamicStructuredTool({
  name: 'cmc_listings',
  description: 'Top cryptocurrencies by market cap from CoinMarketCap.',
  schema: z.object({
    limit: z.number().int().min(1).max(5000).default(50),
    convert: z.string().default('USD'),
  }),
  func: async ({ limit, convert }) =>
    callCmc('/cryptocurrency/listings/latest', { limit: String(limit), convert }, TTL_INTRADAY_QUOTE, `cmc top ${limit}`),
});

const quotes = new DynamicStructuredTool({
  name: 'cmc_quotes',
  description: 'Latest quotes for specific symbols from CoinMarketCap (comma-separated).',
  schema: z.object({
    symbol: z.string().describe('Comma-separated symbols, e.g. BTC,ETH'),
    convert: z.string().default('USD'),
  }),
  func: async ({ symbol, convert }) =>
    callCmc('/cryptocurrency/quotes/latest', { symbol, convert }, TTL_INTRADAY_QUOTE, `cmc ${symbol}`),
});

const globalMetrics = new DynamicStructuredTool({
  name: 'cmc_global_metrics',
  description: 'Global crypto market metrics (total market cap, 24h volume, dominance, derivatives) from CoinMarketCap.',
  schema: z.object({ convert: z.string().default('USD') }),
  func: async ({ convert }) => callCmc('/global-metrics/quotes/latest', { convert }, TTL_INTRADAY_QUOTE, 'cmc global'),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.COINMARKETCAP_API_KEY) return null;
  return [listings, quotes, globalMetrics];
}