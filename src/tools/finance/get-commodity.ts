/**
 * Commodities meta-tool. Routes to the best provider for the requested
 * commodity:
 *   - Alpha Vantage: WTI, BRENT, NATURAL_GAS, COPPER, ALUMINUM, WHEAT,
 *     CORN, COTTON, SUGAR, COFFEE, COCOA, LUMBER, LEAN_HOGS, LIVE_CATTLE
 *   - FRED (when Alpha Vantage missing): only selected series (DCOILWTICO
 *     for WTI, DPRICE for CRB Index, PCOPPUSDM for copper)
 *
 * Returns the latest daily price + brief history so the agent can put the
 * number in context (e.g., "WTI is at $X, +Y% on the week, vs 1y average $Z").
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchJson } from './utils.js';
import { formatToolResult, type SourceRef } from '../types.js';
import { withProviderFallback } from './provider-call.js';
import { alphavantageCommodity } from './providers/alpha-vantage.js';

export const GET_COMMODITY_DESCRIPTION = `
Latest daily price for a commodity. Supports WTI, Brent, natural gas, copper,
aluminum, wheat, corn, cotton, sugar, coffee, cocoa, lumber, lean hogs, live
cattle, and a broad commodities index.

Returns the most recent daily price and a short history window. Use this
whenever the user asks about oil prices, gold, agricultural commodities, or
"what are commodities doing today".

Examples:
- "oil price" → WTI (default)
- "brent crude" → BRENT
- "what's natural gas doing" → NATURAL_GAS
- "corn futures" → CORN
- "broad commodities index" → ALL_COMMODITIES
`.trim();

const COMMODITY_ALIASES: Record<string, string> = {
  oil: 'WTI',
  wti: 'WTI',
  crude: 'WTI',
  'crude oil': 'WTI',
  brent: 'BRENT',
  'brent crude': 'BRENT',
  gas: 'NATURAL_GAS',
  'natural gas': 'NATURAL_GAS',
  ng: 'NATURAL_GAS',
  copper: 'COPPER',
  aluminum: 'ALUMINUM',
  aluminium: 'ALUMINUM',
  wheat: 'WHEAT',
  corn: 'CORN',
  cotton: 'COTTON',
  sugar: 'SUGAR',
  coffee: 'COFFEE',
  cocoa: 'COCOA',
  lumber: 'LUMBER',
  'lean hogs': 'LEAN_HOGS',
  'live cattle': 'LIVE_CATTLE',
  commodities: 'ALL_COMMODITIES',
  index: 'ALL_COMMODITIES',
};

// FRED series for the most-traded commodities (fallback when Alpha Vantage
// is missing). FRED only covers a small subset.
const FRED_SERIES: Record<string, string> = {
  WTI: 'DCOILWTICO', // WTI crude
  BRENT: 'DCOILBRENTEU', // Brent crude
  NATURAL_GAS: 'DHHNGSP', // Henry Hub natural gas
  COPPER: 'PCOPPUSDM', // Global price of copper
  ALUMINUM: 'PALUMUSDM', // Global price of aluminum
  CORN: 'PMAIZMTUSDM', // Global price of corn
  WHEAT: 'PWHEAMTUSDM', // Global price of wheat
  SUGAR: 'PSUGAISAUSDM', // Global price of sugar
  COFFEE: 'PCOFFOTMUSDM', // Global price of coffee
  COTTON: 'PCOTTINDUSDM', // Global price of cotton
};

function resolveCommodity(input: string): string {
  const upper = input.trim().toUpperCase();
  // The dictionary keys are stored lowercase (e.g. "oil") for readability; check both.
  const lower = upper.toLowerCase();
  if (lower in COMMODITY_ALIASES) return COMMODITY_ALIASES[lower];
  if (upper in COMMODITY_ALIASES) return COMMODITY_ALIASES[upper];
  // Already a canonical name (e.g., "WTI")?
  if (Object.values(COMMODITY_ALIASES).includes(upper)) return upper;
  return upper;
}

// Exported for testing.
export { resolveCommodity as _resolveCommodityForTest };

const GetCommodityInputSchema = z.object({
  commodity: z
    .string()
    .default('WTI')
    .describe('Commodity name or alias. Examples: WTI, BRENT, "crude oil", "natural gas", COPPER, WHEAT, ALL_COMMODITIES.'),
  interval: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

export const getCommodity = new DynamicStructuredTool({
  name: 'get_commodity',
  description: GET_COMMODITY_DESCRIPTION,
  schema: GetCommodityInputSchema,
  func: async (input) => {
    const commodity = resolveCommodity(input.commodity);
    const interval = input.interval;

    // Build a fallback chain: Alpha Vantage first, then FRED for the few
    // commodities it covers, then a graceful error.
    const providers: Array<{ name: string; call: () => Promise<{ provider: string; raw: string }> }> = [];

    if (process.env.ALPHA_VANTAGE_API_KEY) {
      providers.push({
        name: 'Alpha Vantage',
        call: async () => {
          const raw = await alphavantageCommodity.invoke({ commodity: commodity as never, interval });
          return { provider: 'Alpha Vantage', raw };
        },
      });
    }

    if (process.env.FRED_API_KEY && FRED_SERIES[commodity]) {
      providers.push({
        name: 'FRED',
        call: async () => {
          const apiKey = process.env.FRED_API_KEY!;
          const seriesId = FRED_SERIES[commodity];
          const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=30`;
          const raw = await fetchJson(url, 'FRED commodity');
          return { provider: 'FRED', raw: JSON.stringify({ data: raw }) };
        },
      });
    }

    if (providers.length === 0) {
      return formatToolResult(
        {
          error:
            'No commodity data sources configured. Set ALPHA_VANTAGE_API_KEY in .env to enable commodity prices. FRED provides a small fallback subset (WTI, BRENT, NATURAL_GAS, COPPER, WHEAT, CORN, SUGAR, COFFEE, COTTON, ALUMINUM).',
        },
        [],
      );
    }

    try {
      const result = await withProviderFallback(providers);
      const parsed = JSON.parse(result.raw);
      const sourceUrl = result.provider === 'Alpha Vantage'
        ? `https://www.alphavantage.co/query?function=${commodity}&interval=${interval}&apikey=***`
        : `https://fred.stlouisfed.org/series/${FRED_SERIES[commodity]}`;
      const sources: SourceRef[] = [
        { id: 1, url: sourceUrl, provider: result.provider.toLowerCase() },
      ];
      return JSON.stringify({
        data: {
          commodity,
          provider: result.provider,
          interval,
          result: parsed.data ?? parsed,
        },
        sourceUrls: [sourceUrl],
        sources,
        provider: result.provider,
        asOf: new Date().toISOString(),
      });
    } catch (error) {
      return formatToolResult(
        { error: error instanceof Error ? error.message : String(error), commodity },
        [],
      );
    }
  },
});