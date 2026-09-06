import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult, type SourceRef } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { withTimeout, SUB_TOOL_TIMEOUT_MS } from './utils.js';
import { MARKET_DATA_FORMATTERS } from './formatters.js';
import { getAllProviderLeaves } from './providers/index.js';
import { getAllNewsLeaves } from '../news/index.js';

/**
 * Rich description for the get_market_data tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const GET_MARKET_DATA_DESCRIPTION = `
Intelligent meta-tool for retrieving market data including prices, news, and insider activity. Takes a natural language query and automatically routes to appropriate market data sources.

## When to Use

- Current stock price snapshots (price, market cap, volume, 52-week high/low)
- Historical stock prices over date ranges
- Available stock ticker lookup
- Current cryptocurrency price snapshots
- Historical cryptocurrency prices over date ranges
- Available crypto ticker lookup
- Multi-asset price comparisons
- Company news and recent headlines
- Broad market news (macro, rates, earnings, geopolitics)
- Insider trading activity
- Institutional holdings (SEC 13F — who holds a security, what a filer holds)
- Price move explanations ("why did X go up/down" → combines price + news)
- Multi-region price data (US, EU, UK, JP, IN, HK, CN via EODHD's TICKER.EXCHANGE notation)

## When NOT to Use

- Company financials like income statements, balance sheets, cash flow (use get_financials)
- Financial metrics and key ratios (use get_financials)
- SEC filings (use read_filings)
- Stock screening by criteria (use stock_screener)
- General web searches (use web_search)

## Usage Notes

- Call ONCE with the complete natural language query - the tool handles complexity internally
- Handles ticker resolution automatically (Apple -> AAPL, Bitcoin -> BTC)
- Handles date inference (e.g., "last month", "past year", "YTD")
- For "what ticker is X?" queries, this tool can look up available tickers
- Returns structured JSON data with source URLs for verification
`.trim();

/** Format snake_case tool name to Title Case for progress messages */
function formatSubToolName(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Import market data tools directly (avoid circular deps with index.ts)
import { getStockPrice, getStockPrices, getStockTickers } from './stock-price.js';
import { getCryptoPriceSnapshot, getCryptoPrices, getCryptoTickers } from './crypto.js';
import { getCompanyNews } from './news.js';
import { getInsiderTrades } from './insider_trades.js';
import { getInstitutionalHoldings } from './institutional_holdings.js';

// All market data tools available for routing
const MARKET_DATA_TOOLS: StructuredToolInterface[] = [
  // Stock Prices
  getStockPrice,
  getStockPrices,
  getStockTickers,
  // Crypto Prices
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  // News & Activity
  getCompanyNews,
  getInsiderTrades,
  getInstitutionalHoldings,
  // Roadmap providers (only those with env keys set; getLeaves returns [] otherwise)
  ...getAllProviderLeaves(),
  ...getAllNewsLeaves(),
];

// Create a map for quick tool lookup by name
const MARKET_DATA_TOOL_MAP = new Map(MARKET_DATA_TOOLS.map(t => [t.name, t]));

// Build the router system prompt for market data
function buildRouterPrompt(): string {
  // Inventory of active roadmap providers (filtered out at runtime when env keys are missing).
  const allProviders = [...getAllProviderLeaves(), ...getAllNewsLeaves()]
    .map((t) => t.name)
    .sort();
  const providerList = allProviders.length > 0
    ? `\n\n## Active Roadmap Providers (env-gated)

The following provider tools are currently bound in addition to the built-in meta-tools. Use them when the built-in FinancialDatasets tools lack coverage (e.g. global exchanges, specific exchanges, alternative news sources):

${allProviders.map((p) => `- \`${p}\``).join('\n')}

Provider preference order for common queries:
- US stock quote/snapshot (real-time): polygon_stock_snapshot → finnhub_quote → twelvedata_quote → fmp_company_profile → alphavantage_stock_quote → get_stock_price
- US stock aggregates/historical: polygon_stock_aggregates → tiingo_eod_prices → eodhd_eod_prices → twelvedata_time_series → alphavantage_stock_time_series → get_stock_prices
- Crypto price: coingecko_simple_price → cmc_quotes → alphavantage_crypto_rating → get_crypto_price_snapshot
- Forex: alphavantage_fx_rate → twelvedata_fx_rate → polygon_forex_snapshot → get_fx_rates
- Company news (ticker): marketaux_news → benzinga_news → newsapi_everything → get_company_news
- Company profile/peers: fmp_company_profile → finnhub_company_profile → finnhub_peers
- Analyst sentiment: finnhub_sentiment → finnhub_recommendation
- Global equities (non-US, format TICKER.EXCHANGE): eodhd_eod_prices → eodhd_fundamentals → tiingo_eod_prices

For non-US tickers, the EODHD format is REQUIRED (e.g., "VOD.LSE" for Vodafone on London, "7203.TSE" for Toyota, "RELIANCE.NSE" for Reliance India).`
    : '';

  return `You are a market data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about market data, call the appropriate tool(s).

## HARD RULES (non-negotiable)

1. **NEVER call web_search for prices, quotes, or news.** A current price, day change, market cap, or recent news headline is always available via polygon_stock_snapshot / get_stock_price / marketaux_news / coingecko_simple_price / get_crypto_price_snapshot. If you web_search for a price or news that exists in a structured leaf, you have failed.

2. **Use get_market_data ONCE per query.** This meta-tool orchestrates the leaf calls internally. Do NOT also call the underlying leaves directly when you call get_market_data — that doubles the data and the latency.

3. **For ≤3 metrics on ≤2 tickers, 1 meta-tool call is enough.** Examples:
   - "AAPL price + change" → 1× get_market_data
   - "BTC + ETH price" → 1× get_market_data (returns both)
   - Stop calling tools once you have the numbers the user asked for.

## Guidelines

1. **Ticker Resolution**: Convert company/crypto names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA
   - Bitcoin → BTC, Ethereum → ETH, Solana → SOL
   - For non-US tickers, use TICKER.EXCHANGE notation (e.g., VOD.LSE, 7203.TSE, RELIANCE.NSE, 0700.HK)

2. **Date Inference**: Use schema-supported filters for date ranges:
   - "last month" → start_date 1 month ago, end_date today
   - "past year" → start_date 1 year ago, end_date today
   - "YTD" → start_date Jan 1 of current year, end_date today
   - "2024" → start_date 2024-01-01, end_date 2024-12-31

3. **Tool Selection (built-in meta-tools)**:
   - For a current US stock quote/snapshot (price, market cap, volume) → get_stock_price
   - For historical US stock prices over a date range → get_stock_prices
   - For "what stocks are available" or ticker lookup → get_stock_tickers
   - For a current crypto price/snapshot → get_crypto_price_snapshot
   - For historical crypto prices over a date range → get_crypto_prices
   - For "what cryptos are available" or crypto ticker lookup → get_crypto_tickers
   - For company-specific news from Financial Datasets → get_company_news with ticker
   - For broad market news → get_company_news without ticker
   - For insider buying/selling activity → get_insider_trades
   - For who holds a stock (largest holders, 13F holders of X) → get_institutional_holdings with ticker
   - For a specific manager's portfolio (Citadel, Berkshire, BlackRock, etc.) → get_institutional_holdings with filer_name
   - For "why did X go up/down" → combine get_stock_price + get_company_news

4. **Tool Selection (roadmap providers — see "Active Roadmap Providers" below)**:
   - Prefer the preferred provider for the query type per the table above
   - When Financial Datasets lacks the data (e.g., a global ticker, an alt news source), fall back to the roadmap provider
   - When a roadmap provider supports the query directly (e.g., benzinga_news for ticker-specific news), use it instead of the generic get_company_news

5. **Efficiency**:
   - For current/latest price, use snapshot tools (not historical with limit 1)
   - For comparisons between assets, call the same tool for each ticker
   - Use the smallest date range that answers the question
   - Issue multiple tool calls in a SINGLE turn when sub-queries are independent (they run in parallel)${providerList}

Call the appropriate tool(s) now.`;
}

// Input schema for the get_market_data tool
const GetMarketDataInputSchema = z.object({
  query: z.string().describe('Natural language query about market data, prices, news, or insider activity'),
});

/**
 * Create a get_market_data tool configured with the specified model.
 * Uses native LLM tool calling for routing queries to market data tools.
 */
export function createGetMarketData(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_market_data',
    description: `Intelligent meta-tool for retrieving market data including prices, news, and insider activity. Takes a natural language query and automatically routes to appropriate market data tools. Use for:
- Current and historical stock prices
- Current and historical cryptocurrency prices
- Stock and crypto ticker lookup
- Company news and recent headlines
- Broad market news (omit ticker)
- Insider trading activity
- Institutional holdings (SEC 13F)`,
    schema: GetMarketDataInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

      // 1. Call LLM with market data tools bound (native tool calling)
      onProgress?.('Fetching market data...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: MARKET_DATA_TOOLS,
      });
      const aiMessage = response as AIMessage;

      // 2. Check for tool calls
      const toolCalls = aiMessage.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for query' }, []);
      }

      // 3. Execute tool calls in parallel
      const toolNames = [...new Set(toolCalls.map(tc => formatSubToolName(tc.name)))];
      onProgress?.(`Fetching from ${toolNames.join(', ')}...`);
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = MARKET_DATA_TOOL_MAP.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await withTimeout(tool.invoke(tc.args), SUB_TOOL_TIMEOUT_MS, tc.name);
            const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 4. Combine results with numbered source citations.
      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);

      // Build numbered source references; dedupe by URL.
      const allSources: SourceRef[] = [];
      const seenUrls = new Set<string>();
      const citationsByResult = new Map<number, number[]>(); // resultIndex -> citation IDs
      let nextCitation = 1;
      successfulResults.forEach((r, i) => {
        const ids: number[] = [];
        for (const url of r.sourceUrls) {
          if (typeof url !== 'string' || !url) continue;
          const existing = allSources.find((s) => s.url === url);
          if (existing) {
            ids.push(existing.id);
            continue;
          }
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          const id = nextCitation++;
          allSources.push({ id, url, provider: r.tool });
          ids.push(id);
        }
        citationsByResult.set(i, ids);
      });

      // Build combined data structure.
      const combinedData: Record<string, unknown> = {};
      successfulResults.forEach((result, i) => {
        const ticker = (result.args as Record<string, unknown>).ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        const formatter = MARKET_DATA_FORMATTERS[result.tool];
        const formatted = formatter
          ? formatter(result.data, result.args as Record<string, unknown>)
          : result.data;
        combinedData[key] = {
          data: formatted,
          citations: citationsByResult.get(i) ?? [],
          provider: result.tool,
        };
      });

      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }

      const allUrls = allSources.map((s) => s.url);
      return JSON.stringify({
        data: combinedData,
        sourceUrls: allUrls,
        sources: allSources,
        provider: 'get_market_data router',
        asOf: new Date().toISOString(),
      });
    },
  });
}
