/**
 * Catalyst calendar meta-tool. Pulls upcoming earnings (with EPS/revenue
 * estimates) from FMP, falling back to Finnhub when FMP is missing.
 *
 * Used to identify near-term catalysts — when does the next inflection point
 * arrive that could move the stock? Top-tier analysts never quote a price
 * target without naming the next catalyst.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { fmpEarningsCalendar } from './providers/fmp.js';
import { finnhubEarningsCalendar } from './providers/finnhub.js';
import { withProviderFallback } from './provider-call.js';
import { formatToolResult, type SourceRef } from '../types.js';

export const GET_CATALYST_CALENDAR_DESCRIPTION = `
Upcoming earnings + catalyst calendar. Returns the next 30 days of earnings
releases with EPS/revenue estimates.

Use this whenever you write an investment thesis, recommendation, or price
target — cite the next catalyst date so the user knows when to expect
movement. If FMP and Finnhub disagree on dates, prefer FMP.

Examples:
- "earnings calendar for AAPL" → next AAPL earnings
- "what reports this week" → all tickers reporting in the next 7 days
- "upcoming catalysts" → broad earnings feed for the next 30 days
`.trim();

const GetCatalystCalendarInputSchema = z.object({
  ticker: z.string().optional().describe('Optional ticker filter (e.g. AAPL). Omit for broad market.'),
  days: z.number().int().min(1).max(90).default(14).describe('Look-ahead window in days.'),
});

export const getCatalystCalendar = new DynamicStructuredTool({
  name: 'get_catalyst_calendar',
  description: GET_CATALYST_CALENDAR_DESCRIPTION,
  schema: GetCatalystCalendarInputSchema,
  func: async (input) => {
    const today = new Date();
    const end = new Date(today.getTime() + input.days * 24 * 60 * 60 * 1000);
    const from = today.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);

    // Build a fallback chain. FMP first, Finnhub second. Both honor an
    // optional ticker filter (FMP ignores it but still returns the broad feed;
    // we filter client-side).
    const providers = [];
    if (process.env.FMP_API_KEY) {
      providers.push({
        name: 'FMP',
        call: async () => {
          const raw = await fmpEarningsCalendar.invoke({ from, to });
          return { provider: 'FMP', raw };
        },
      });
    }
    if (process.env.FINNHUB_API_KEY) {
      providers.push({
        name: 'Finnhub',
        call: async () => {
          const raw = await finnhubEarningsCalendar.invoke({
            from,
            to,
            ...(input.ticker ? { symbol: input.ticker.toUpperCase() } : {}),
          });
          return { provider: 'Finnhub', raw };
        },
      });
    }

    if (providers.length === 0) {
      return formatToolResult(
        {
          error:
            'No catalyst data sources configured. Set FMP_API_KEY or FINNHUB_API_KEY in .env to enable the calendar.',
        },
        [],
      );
    }

    try {
      const result = await withProviderFallback(providers);
      const parsed = JSON.parse(result.raw as string);
      const data = parsed.data ?? {};

      // Normalize output — FMP returns an array of earnings events directly;
      // Finnhub returns { earningsCalendar: [...] }. Filter by ticker if asked.
      const events = Array.isArray(data)
        ? data
        : Array.isArray((data as { earningsCalendar?: unknown[] }).earningsCalendar)
          ? (data as { earningsCalendar: unknown[] }).earningsCalendar
          : [];

      const tickerUpper = input.ticker?.toUpperCase();
      const filtered = tickerUpper
        ? events.filter((e: { symbol?: string }) => (e.symbol ?? '').toUpperCase() === tickerUpper)
        : events;

      const sorted = (filtered as Array<Record<string, unknown>>)
        .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
        .slice(0, 200); // safety cap

      const sourceUrls = parsed.sourceUrls ?? [];
      const sources: SourceRef[] = sourceUrls.map((u: string, i: number) => ({
        id: i + 1,
        url: u,
        provider: result.provider,
      }));

      return JSON.stringify({
        data: {
          provider: result.provider,
          from,
          to,
          count: sorted.length,
          events: sorted,
        },
        sourceUrls,
        sources,
        provider: result.provider,
        asOf: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return formatToolResult({ error: message, providers: providers.map((p) => p.name) }, []);
    }
  },
});