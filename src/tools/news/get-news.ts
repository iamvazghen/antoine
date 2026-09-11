/**
 * News router meta-tool. Picks the best news source for the query:
 *   - Ticker-specific news with sentiment: Marketaux (entity-level sentiment)
 *   - Ticker-specific market-moving news: Benzinga (channels, headlines)
 *   - Broad topic search across thousands of sources: NewsAPI
 *
 * Ponytail: a single meta-tool beats wiring the agent to pick one of three
 * separate news tools — the meta-tool decides based on the query shape.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult, type SourceRef } from '../types.js';
import { getCurrentDate } from '../../utils/format.js';
import { withTimeout, SUB_TOOL_TIMEOUT_MS } from '../finance/utils.js';
import { getLeaves as newsapiLeaves } from './newsapi.js';
import { getLeaves as marketauxLeaves } from './marketaux.js';
import { getLeaves as benzingaLeaves } from './benzinga.js';

export const GET_NEWS_DESCRIPTION = `
Financial news meta-tool. Picks the best news provider for the query:

- For ticker-specific news with entity-level sentiment (e.g., "latest news on AAPL"): prefer Marketaux (entity sentiment) or Benzinga (market-moving headlines).
- For broad topic searches across 80k+ sources (e.g., "AI regulation news", "everything on the Fed"): prefer NewsAPI.
- For day-back window queries (e.g., "last 3 days", "this week"): all three work; default to Benzinga.

Returns numbered sources so you can cite them inline ([1], [2], etc.).
`.trim();

const NEWS_TOOLS: StructuredToolInterface[] = [
  ...(marketauxLeaves() ?? []),
  ...(benzingaLeaves() ?? []),
  ...(newsapiLeaves() ?? []),
];

const NEWS_TOOL_MAP = new Map(NEWS_TOOLS.map((t) => [t.name, t]));

const NEWS_ROUTER_PROMPT = `You are a financial news routing assistant.
Current date: ${getCurrentDate()}

Pick the best news tool for the query:

- If the query is ticker-specific (e.g., "news on AAPL", "what's moving NVDA today") and asks for sentiment/impact, prefer Marketaux (entity-level sentiment).
- If the query is ticker-specific and asks for headlines/catalysts, prefer Benzinga (channels + market-moving headlines).
- If the query is broad (e.g., "AI regulation", "Federal Reserve news", "everything on rate cuts"), prefer NewsAPI.
- If a tool is missing (no NEWSAPI_KEY, MARKETAUX_API_KEY, or BENZINGA_API_KEY set), pick whichever is available — do not error.

Issue a single tool call with the appropriate args.`;

const GetNewsInputSchema = z.object({
  query: z.string().describe('Natural language news query (tickers, topics, or both)'),
  days_back: z.number().int().min(1).max(30).default(3).describe('How many days back to search.'),
  limit: z.number().int().min(1).max(50).default(10),
});

export const getNews = new DynamicStructuredTool({
  name: 'get_news',
  description: GET_NEWS_DESCRIPTION,
  schema: GetNewsInputSchema,
  func: async (input, _runManager, config?: RunnableConfig) => {
    const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

    if (NEWS_TOOLS.length === 0) {
      return formatToolResult(
        { error: 'No news providers configured. Set NEWSAPI_KEY, MARKETAUX_API_KEY, or BENZINGA_API_KEY in .env.' },
        [],
      );
    }

    onProgress?.('Routing news query...');
    const { response } = await callLlm(input.query, {
      systemPrompt: NEWS_ROUTER_PROMPT,
      tools: NEWS_TOOLS,
    });
    const aiMessage = response as unknown as { tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }> };
    const toolCalls = aiMessage.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return formatToolResult({ error: 'No news tool selected for query' }, []);
    }

    // Apply default args (days_back, limit) when the model didn't specify them
    const augmented = toolCalls.map((tc) => ({
      ...tc,
      args: {
        days_back: input.days_back,
        limit: input.limit,
        ...tc.args,
      },
    }));

    onProgress?.(`Fetching from ${augmented.map((tc) => tc.name).join(', ')}...`);
    const results = await Promise.all(
      augmented.map(async (tc) => {
        try {
          const tool = NEWS_TOOL_MAP.get(tc.name);
          if (!tool) throw new Error(`Tool '${tc.name}' not registered`);
          const rawResult = await withTimeout(tool.invoke(tc.args), SUB_TOOL_TIMEOUT_MS, tc.name);
          const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
          const parsed = JSON.parse(result);
          return {
            tool: tc.name,
            args: tc.args,
            data: parsed.data,
            sourceUrls: parsed.sourceUrls || [],
            error: null as string | null,
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
      }),
    );

    const successful = results.filter((r) => r.error === null);
    const failed = results.filter((r) => r.error !== null);

    // Numbered source citations
    const sources: SourceRef[] = [];
    const seen = new Set<string>();
    let nextId = 1;
    for (const r of successful) {
      for (const url of r.sourceUrls) {
        if (typeof url !== 'string' || !url) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        sources.push({ id: nextId++, url, provider: r.tool });
      }
    }

    const combinedData: Record<string, unknown> = {};
    for (const r of successful) {
      combinedData[r.tool] = r.data;
    }
    if (failed.length > 0) {
      combinedData._errors = failed.map((r) => ({ tool: r.tool, error: r.error }));
    }

    return JSON.stringify({
      data: combinedData,
      sourceUrls: sources.map((s) => s.url),
      sources,
      provider: 'get_news router',
      asOf: new Date().toISOString(),
    });
  },
});