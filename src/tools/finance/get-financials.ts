import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult, type SourceRef } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { withTimeout, SUB_TOOL_TIMEOUT_MS } from './utils.js';
import { FINANCIAL_FORMATTERS } from './formatters.js';
import { getAllProviderLeaves } from './providers/index.js';

/**
 * Rich description for the get_financials tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const GET_FINANCIALS_DESCRIPTION = `
Intelligent meta-tool for retrieving company financial data. Takes a natural language query and automatically routes to appropriate financial data sources.

## When to Use

- Company facts (sector, industry, market cap, number of employees, listing date, exchange, location, weighted average shares, website)
- Company financials (income statements, balance sheets, cash flow statements)
- Financial metrics and key ratios (P/E ratio, market cap, EPS, dividend yield, enterprise value, ROE, ROA, margins)
- Historical metrics and trend analysis across multiple periods
- Financial segment breakdowns (revenue, margins, etc. by product / geography)
- Earnings data (EPS/revenue beat-miss, earnings surprises, latest earnings feed)
- Multi-company comparisons (pass the full query, it handles routing internally)

## When NOT to Use

- Stock or cryptocurrency prices (use get_market_data instead)
- Company news or insider trading activity (use get_market_data instead)
- General web searches or non-financial topics (use web_search instead)
- Questions that don't require external financial data (answer directly from knowledge)
- Non-public company information
- Real-time trading or order execution
- Reading SEC filing content (use read_filings instead)
- Stock screening by criteria (use stock_screener)

## Usage Notes

- Call ONCE with the complete natural language query - the tool handles complexity internally
- For comparisons like "compare AAPL vs MSFT revenue", pass the full query as-is
- Handles ticker resolution automatically (Apple -> AAPL, Microsoft -> MSFT)
- Handles date inference (e.g., "last quarter", "past 5 years", "YTD")
- Returns structured JSON data with source URLs for verification
`.trim();

/** Format snake_case tool name to Title Case for progress messages */
function formatSubToolName(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Import all finance tools directly (avoid circular deps with index.ts)
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from './fundamentals.js';
import { getKeyRatios, getHistoricalKeyRatios } from './key-ratios.js';
import { getFinancialSegments } from './segments.js';
import { getEarnings } from './earnings.js';

// All finance tools available for routing
const FINANCE_TOOLS: StructuredToolInterface[] = [
  // Fundamentals
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  // Earnings
  getEarnings,
  // Key Ratios & Snapshots
  getKeyRatios,
  getHistoricalKeyRatios,
  // Other Data
  getFinancialSegments,
  // Roadmap providers (env-gated)
  ...getAllProviderLeaves(),
];

// Create a map for quick tool lookup by name
const FINANCE_TOOL_MAP = new Map(FINANCE_TOOLS.map(t => [t.name, t]));

// Build the router system prompt - simplified since LLM sees tool schemas
function buildRouterPrompt(): string {
  const allProviders = getAllProviderLeaves().map((t) => t.name).sort();
  const providerSection = allProviders.length > 0
    ? `\n\n## Active Roadmap Providers (env-gated)

The following provider tools are currently bound. Prefer them when the built-in Financial Datasets tools lack coverage:

${allProviders.map((p) => `- \`${p}\``).join('\n')}

Provider preference order for common queries:
- US fundamentals (income/balance/cash flow): fmp_income_statement → fmp_balance_sheet → tiingo_fundamentals → eodhd_fundamentals (TICKER.US) → get_income_statements / get_balance_sheets / get_cash_flow_statements
- Ratios + valuation metrics: fmp_ratios → finnhub_quote + finnhub_recommendation → get_key_ratios
- Intrinsic value / DCF: fmp_dcf_valuation
- Company profile + peers: fmp_company_profile → finnhub_company_profile → finnhub_peers
- Earnings history: get_earnings (Financial Datasets beats/misses + analyst estimates)
- Global (non-US) fundamentals: eodhd_fundamentals (TICKER.EXCHANGE notation)

For non-US tickers, the EODHD format is REQUIRED (e.g., "VOD.LSE" for Vodafone on London, "RELIANCE.NSE" for Reliance India).`
    : '';

  return `You are a financial data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial data, call the appropriate financial tool(s).

## HARD RULES (these are non-negotiable)

1. **NEVER call web_search for financial data.** No quarterly revenue, P/E ratio, market cap, or balance sheet line item has ever been the right thing to web-search. The structured APIs below have all of it. If you web_search for a number that exists in fmp_income_statement / get_income_statements / fmp_ratios, you have failed.

2. **Use get_financials ONCE per multi-company query.** If the user asks "compare X, Y, Z on revenue", call get_financials once and let it fan out. Do NOT also call the underlying leaves (fmp_income_statement etc.) — that doubles the data. get_financials orchestrates the leaf calls internally.

3. **For ≤4 metrics on a single company, 1-3 leaf calls is enough.** Do not fan out to 6+ tools for a "give me P/E + market cap" question. If the data is in 2 tools (e.g., fmp_ratios for P/E, finnhub_quote for market cap), use those 2 tools. Stop when you have what was asked.

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA
   - For non-US tickers, use TICKER.EXCHANGE notation (VOD.LSE, 7203.TSE, RELIANCE.NSE, 0700.HK)

2. **Date Inference**: Use schema-supported filters for date ranges:
   - "last year" → report_period_gte 1 year ago
   - "last quarter" → report_period_gte 3 months ago
   - "past 5 years" → report_period_gte 5 years ago and limit 5 (annual) or 20 (quarterly)
   - "YTD" → report_period_gte Jan 1 of current year

3. **Tool Selection (built-in Financial Datasets tools)**:
   - For latest financial metrics snapshot (P/E, margins, ROE, EPS, growth rates) → get_key_ratios
   - For historical P/E ratio, historical market cap, valuation metrics over time → get_historical_key_ratios
   - For revenue, earnings, profitability → get_income_statements
   - For latest earnings release snapshot, EPS/revenue beat-miss, earnings surprises, or latest earnings feed → get_earnings
   - For "latest earnings", "recent earnings", or "earnings feed" across the market, call get_earnings without a ticker
   - For debt, assets, equity → get_balance_sheets
   - For cash flow, free cash flow → get_cash_flow_statements
   - For comprehensive analysis → get_all_financial_statements
   - For revenue/operating-income split by segment → get_financial_segments

4. **Tool Selection (roadmap providers — see "Active Roadmap Providers" below)**:
   - Prefer the roadmap provider in the preference order above per query type
   - For DCF / intrinsic value: fmp_dcf_valuation
   - For non-US tickers, always use eodhd_fundamentals with TICKER.EXCHANGE notation

5. **Efficiency**:
   - Prefer specific tools over general ones when possible
   - Use get_all_financial_statements only when multiple statement types needed
   - For comparisons between companies, call the same tool for each ticker in ONE turn (parallel)
   - Always use the smallest limit that can answer the question:
     - Point-in-time/latest questions → limit 1
     - Short trend (2-3 periods) → limit 3
     - Medium trend (4-5 periods) → limit 5
   - Increase limit beyond defaults only when the user explicitly asks for long history (e.g., 10-year trend)
   - Issue multiple tool calls in a SINGLE turn when sub-queries are independent (they run in parallel)${providerSection}

Call the appropriate tool(s) now.`;
}

// Input schema for the get_financials tool
const GetFinancialsInputSchema = z.object({
  query: z.string().describe('Natural language query about financial data'),
});

/**
 * Create a get_financials tool configured with the specified model.
 * Uses native LLM tool calling for routing queries to finance tools.
 */
export function createGetFinancials(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_financials',
    description: `Intelligent meta-tool for retrieving company financial data. Takes a natural language query and automatically routes to appropriate financial data tools. Use for:
- Company financials (income statements, balance sheets, cash flow)
- Financial metrics and key ratios (P/E ratio, market cap, EPS, dividend yield, ROE, margins)
- Historical metrics and trend analysis
- Earnings data, latest earnings feed, and financial segments`,
    schema: GetFinancialsInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

      // 1. Call LLM with finance tools bound (native tool calling)
      onProgress?.('Fetching...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: FINANCE_TOOLS,
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
            const tool = FINANCE_TOOL_MAP.get(tc.name);
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

      // Numbered, deduped source references
      const allSources: SourceRef[] = [];
      const seenUrls = new Set<string>();
      const citationsByResult = new Map<number, number[]>();
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

      // Build combined data structure
      const combinedData: Record<string, unknown> = {};
      successfulResults.forEach((result, i) => {
        const ticker = (result.args as Record<string, unknown>).ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        const formatter = FINANCIAL_FORMATTERS[result.tool];
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
        provider: 'get_financials router',
        asOf: new Date().toISOString(),
      });
    },
  });
}
