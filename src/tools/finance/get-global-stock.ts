/**
 * Region-aware global stock meta-tool. For non-US tickers (LSE, TSE, HK,
 * NSE, ASX, etc.) it normalizes the EODHD `TICKER.EXCHANGE` format, pulls
 * the data, and decorates the response with the region's currency and
 * trading hours so the agent doesn't confuse pence with pennies or JPY
 * for USD.
 *
 * For US tickers, falls through to the standard FinancialDatasets tools.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchJson } from './utils.js';
import { formatToolResult, type SourceRef } from '../types.js';
import { parseTicker, getRegion, formatMarketCap } from './region-helpers.js';

const LABEL = 'Global Stock (EODHD)';

export const GET_GLOBAL_STOCK_DESCRIPTION = `
Region-aware stock quote for non-US tickers. Normalizes the EODHD
TICKER.EXCHANGE notation (e.g., "VOD.LSE", "7203.TSE", "RELIANCE.NSE",
"0700.HK", "ASML.AS", "SHOP.TO") and returns a price + market cap in the
region's local currency.

Use this when the ticker is anything other than a bare US symbol. For US
tickers, use get_stock_price / get_market_data instead.

Examples:
- "VOD.LSE" → Vodafone on the London Stock Exchange (price in GBp)
- "7203.TSE" → Toyota on the Tokyo Stock Exchange (price in JPY)
- "RELIANCE.NSE" → Reliance Industries on NSE India (price in INR)
- "ASML.AS" → ASML on Euronext Amsterdam (price in EUR)
- "0700.HK" → Tencent on Hong Kong (price in HKD)
- "SHOP.TO" → Shopify on TSX (price in CAD)
`.trim();

const GetGlobalStockInputSchema = z.object({
  ticker: z.string().describe('Fully qualified ticker like TICKER.EXCHANGE (e.g., "VOD.LSE", "7203.TSE").'),
});

export const getGlobalStock = new DynamicStructuredTool({
  name: 'get_global_stock',
  description: GET_GLOBAL_STOCK_DESCRIPTION,
  schema: GetGlobalStockInputSchema,
  func: async (input) => {
    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      return formatToolResult(
        { error: 'EODHD_API_KEY is not set. Set it in .env to enable global stock coverage.' },
        [],
      );
    }

    const { symbol, exchange } = parseTicker(input.ticker);
    if (!exchange) {
      return formatToolResult(
        { error: `Ticker "${input.ticker}" is missing an exchange suffix. Use TICKER.EXCHANGE (e.g., "VOD.LSE").` },
        [],
      );
    }

    const region = getRegion(exchange);
    if (!region) {
      return formatToolResult(
        {
          error: `Unknown exchange suffix "${exchange}". Supported: LSE, PA, AS, DE, SW, TSE, HK, SHG, SHE, NSE, BSE, AX, TO, KS, SI, etc.`,
        },
        [],
      );
    }

    const url = `https://eodhd.com/api/eod/${symbol}.${region.exchange}?api_token=${apiKey}&fmt=json&period=d&order=d&limit=5`;
    let raw: unknown;
    try {
      raw = await fetchJson(url, LABEL);
    } catch (error) {
      return formatToolResult(
        { error: error instanceof Error ? error.message : String(error), exchange: region.exchange, region: region.name },
        [],
      );
    }

    // EODHD returns an array of EOD bars; the latest entry is the current close.
    // EODHD also returns a bare object like {"error": "..."} on bad input — detect that.
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'error' in (raw as Record<string, unknown>)) {
      const errMsg = String((raw as { error: unknown }).error);
      return formatToolResult(
        {
          error: `EODHD returned an error for ${symbol}.${region.exchange}: ${errMsg}. ` +
            `Try a different exchange suffix or use the bare eodhd_eod_prices tool with the exact TICKER.EXCHANGE format EODHD expects.`,
          ticker: input.ticker.toUpperCase(),
          exchange: region.exchange,
          provider: 'eodhd',
        },
        [],
      );
    }

    const bars = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
    if (bars.length === 0) {
      return formatToolResult(
        {
          error: `EODHD returned no EOD bars for ${symbol}.${region.exchange}. ` +
            `This usually means the symbol/exchange combination is wrong. ` +
            `For Tokyo stocks, try ${symbol}.TSE (or ${symbol}.T for ETFs/REITs). For LSE, try ${symbol}.LSE. ` +
            `Use the bare eodhd_eod_prices tool to probe with explicit TICKER.EXCHANGE notation.`,
          ticker: input.ticker.toUpperCase(),
          exchange: region.exchange,
          provider: 'eodhd',
          hint: `Common alternative suffixes: ${symbol}.TSE ${symbol}.LSE ${symbol}.PA ${symbol}.DE ${symbol}.HK ${symbol}.NSE ${symbol}.T`,
        },
        [],
      );
    }
    const latest = bars[bars.length - 1];
    const prev = bars.length > 1 ? bars[bars.length - 2] : null;

    const data = {
      ticker: input.ticker.toUpperCase(),
      symbol,
      exchange: region.exchange,
      region: region.name,
      country: region.country,
      currency: region.currency,
      trading_hours_utc: `${region.openUtc}-${region.closeUtc}`,
      as_of: latest?.date ?? null,
      close: latest?.close ?? null,
      open: latest?.open ?? null,
      high: latest?.high ?? null,
      low: latest?.low ?? null,
      volume: latest?.volume ?? null,
      change_pct:
        latest && prev && prev.close != null && Number(prev.close) !== 0
          ? (((Number(latest.close) ?? 0) - Number(prev.close)) / Number(prev.close)) * 100
          : null,
      bars_returned: bars.length,
    };

    // Build a market-cap note for the agent (EODHD fundamentals has it; this
    // endpoint only returns EOD, so the agent can call eodhd_fundamentals for
    // the full picture).
    const sourceUrl = url.split('?')[0];
    const sources: SourceRef[] = [
      { id: 1, url: sourceUrl, provider: 'eodhd', title: `EOD ${symbol}.${region.exchange}` },
    ];

    return JSON.stringify({
      data,
      sourceUrls: [sourceUrl],
      sources,
      provider: 'eodhd',
      asOf: new Date().toISOString(),
      hint: formatMarketCap(0, region) === '' ? undefined : `Prices in ${region.currency} (local unit).`,
    });
  },
});