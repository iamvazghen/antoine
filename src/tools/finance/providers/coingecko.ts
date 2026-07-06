/**
 * CoinGecko — coins, markets, global metrics, simple price.
 * Docs: https://docs.coingecko.com/reference/introduction
 * Activated when COINGECKO_API_KEY is set. Demo plan uses
 * `x_cg_demo_api_key` header; Pro plans use query param.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_INTRADAY_QUOTE } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'CoinGecko';
const BASE_URL = 'https://api.coingecko.com/api/v3';

function apiKey(): string | null {
  return process.env.COINGECKO_API_KEY ?? null;
}

async function callCg(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = apiKey();
  const headers: Record<string, string> = {};
  if (key && key.startsWith('CG-')) {
    headers['x-cg-demo-api-key'] = key;
  } else if (key) {
    url.searchParams.set('x_cg_pro_api_key', key);
  }
  const result = await callProvider({
    provider: 'coingecko', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs, headers,
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: 'coingecko', title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: 'coingecko', asOf: result.asOf, cached: result.cached,
  });
}

const simplePrice = new DynamicStructuredTool({
  name: 'coingecko_simple_price',
  description: 'Latest price for one or more coins from CoinGecko (vs_currency default USD).',
  schema: z.object({
    ids: z.string().describe('Comma-separated coin ids, e.g. bitcoin,ethereum'),
    vs_currency: z.string().default('usd'),
  }),
  func: async ({ ids, vs_currency }) =>
    callCg('/simple/price', {
      ids, vs_currencies: vs_currency,
      include_market_cap: 'true', include_24hr_vol: 'true', include_24hr_change: 'true',
    }, TTL_INTRADAY_QUOTE, `cg simple ${ids}`),
});

const markets = new DynamicStructuredTool({
  name: 'coingecko_markets',
  description: 'Top coins by market cap from CoinGecko.',
  schema: z.object({
    vs_currency: z.string().default('usd'),
    limit: z.number().int().min(1).max(250).default(50),
  }),
  func: async ({ vs_currency, limit }) =>
    callCg('/coins/markets', {
      vs_currency, order: 'market_cap_desc', per_page: String(limit), page: '1',
    }, TTL_INTRADAY_QUOTE, `cg top ${limit}`),
});

const globalMetrics = new DynamicStructuredTool({
  name: 'coingecko_global_metrics',
  description: 'Global crypto market metrics (total market cap, 24h volume, dominance) from CoinGecko.',
  schema: z.object({}),
  func: async () => callCg('/global', {}, TTL_INTRADAY_QUOTE, 'cg global'),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.COINGECKO_API_KEY) return null;
  return [simplePrice, markets, globalMetrics];
}