/**
 * Agent-facing surface for the grading engine.
 *
 * The grades themselves are arithmetic (see src/scoring/factors.ts) — these
 * tools hand the model the numbers and the evidence behind them so it can
 * write the analysis around a score it did not invent.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from './types.js';
import {
  gradeTicker,
  readLedger,
  calibration,
  calibrationProgress,
  readLedgerTickers,
} from '../scoring/grade.js';
import { loadUniverse, saveUniverse, runUniverseReport } from '../scoring/report.js';

/** "1 day", not "1 days" - the agent reads this line out verbatim. */
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

export const GRADE_TICKER_DESCRIPTION = `
Grades a single ticker from 0-100 on two horizons and returns the full factor breakdown.

## Horizons
- **short** (1-3 years): valuation against the company's own history, revenue and
  EPS growth, margin direction, price momentum, relative strength, current
  profitability, balance-sheet safety.
- **long** (20+ years): mean and consistency of return on invested capital,
  operating-margin durability, free-cash-flow conversion, survivability,
  reinvestment runway, capital allocation, behaviour through past drawdowns,
  and the length of the public record.

## When to Use
- Any "is X a good investment", "should I buy X", "rate X", "analyse X" request.
- Before writing an investment memo, so the memo is anchored to a scored view.
- As the opening move on a specific ticker: it is two API calls and gives you
  ROIC history, margin history, valuation percentile and drawdown behaviour at once.

## Reading the result
Every factor reports its own 0-100 sub-score, its weight, and the raw numbers
behind it. \`coverage\` is the share of the horizon's weight that had usable data —
below 60% the grade is thin and should be quoted with that caveat. Grades are
appended to the score ledger automatically, so repeat calls build a track record.

Present the score, then the three or four factors that drove it, then the risks.
Never restate the score as your own independent judgement without the factors.
`.trim();

export const gradeTickerTool = new DynamicStructuredTool({
  name: 'grade_ticker',
  description:
    'Grades a stock 0-100 for both a 1-3 year horizon and a 20+ year horizon, with the full weighted factor breakdown (ROIC durability, margin history, valuation vs own history, drawdown behaviour, balance sheet). Deterministic — the same inputs always give the same score. Use for any single-ticker investment judgement.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker, e.g. "AAPL".'),
    record: z
      .boolean()
      .default(true)
      .describe('Append the grade to the score ledger so future runs can diff it. Default true.'),
  }),
  func: async (input) => {
    const grade = await gradeTicker(input.ticker);
    if (input.record !== false) {
      const { recordScore } = await import('../scoring/grade.js');
      recordScore(grade);
    }
    return formatToolResult(grade, grade.sources);
  },
});

export const INVESTMENT_REPORT_DESCRIPTION = `
Grades the whole universe and returns a ranked report: the best names, what moved
most since the last run, and a review of the positions actually held.

## When to Use
- Scheduled reviews (monthly, quarterly, annual) — this is the tool the cron job calls.
- "What should I buy", "best picks", "what looks good now", "run the review".

## Notes
- The universe is fixed so month-to-month comparisons are like-for-like. It defaults
  to 50 large-cap US names; set your own with the \`universe\` tool action.
- Runs 4 tickers at a time to stay inside provider rate limits. A 50-name universe
  takes a few minutes.
- Every grade is written to the ledger, so the next run reports changes, not just levels.
- Holdings are graded even when outside the universe, and flagged when the case decays.
`.trim();

export const investmentReportTool = new DynamicStructuredTool({
  name: 'investment_report',
  description:
    'Runs the full periodic investment review: grades every ticker in the universe on the chosen horizon, ranks them, diffs against the previous run, and reviews current holdings for decay. Returns ranked results plus a markdown report. Use for scheduled monthly/quarterly/annual reviews and for "best picks" requests.',
  schema: z.object({
    horizon: z
      .enum(['short', 'long'])
      .default('long')
      .describe('"short" for the 1-3 year ranking, "long" for the 20+ year ranking.'),
    top_n: z.number().int().min(1).max(50).default(10).describe('How many names to rank.'),
    tickers: z
      .array(z.string())
      .optional()
      .describe('Grade this list instead of the saved universe. Use for an ad-hoc comparison.'),
  }),
  func: async (input) => {
    const report = await runUniverseReport({
      horizon: input.horizon,
      topN: input.top_n,
      universe: input.tickers,
    });
    return formatToolResult(report);
  },
});

export const SCORE_HISTORY_DESCRIPTION = `
Reads the score ledger: a ticker's grade history, or the calibration check that
asks whether the high grades actually went on to outperform.

## Actions
- \`history\` — every recorded grade for one ticker, with the price at the time.
- \`calibration\` — mean forward return bucketed by the grade at the time. Needs
  months of accumulated history to say anything; report the observation count.
- \`universe\` — read the current universe.
- \`set_universe\` — replace it with your own ticker list.
`.trim();

export const scoreHistoryTool = new DynamicStructuredTool({
  name: 'score_history',
  description:
    'Reads the score ledger — a ticker\'s grade history over time, or the calibration check on whether higher grades produced better forward returns. Also reads and sets the universe used by investment_report.',
  schema: z.object({
    action: z
      .enum(['history', 'calibration', 'universe', 'set_universe'])
      .describe('Which ledger operation to run.'),
    ticker: z.string().optional().describe('Required for action "history".'),
    horizon: z.enum(['short', 'long']).default('long').describe('Horizon for "calibration".'),
    tickers: z.array(z.string()).optional().describe('Required for action "set_universe".'),
  }),
  func: async (input) => {
    switch (input.action) {
      case 'history': {
        if (!input.ticker) throw new Error('ticker is required for action "history"');
        const records = readLedger(input.ticker);
        return formatToolResult({ ticker: input.ticker.toUpperCase(), records });
      }
      case 'calibration': {
        const progress = calibrationProgress();

        // Price the forward leg against today rather than against whenever the
        // ticker next happened to be re-graded. Without this a grade only
        // counts once a *second* grade exists 30+ days later, which on a
        // monthly review cadence pushes the first reading out by months.
        const currentPrices = new Map<string, number>();
        if (progress.daysUntilFirstObservation === 0) {
          const { fetchBundle, latestPrice } = await import('../scoring/data.js');
          const tickers = [...new Set(readLedgerTickers())].slice(0, 60);
          await Promise.all(
            tickers.map(async (t) => {
              try {
                const price = latestPrice(await fetchBundle(t));
                if (price !== null) currentPrices.set(t.toUpperCase(), price);
              } catch {
                // A ticker we cannot price today simply falls back to the
                // recorded-grade comparison; it must not fail the whole report.
              }
            }),
          );
        }

        const buckets = calibration(input.horizon, { currentPrices });
        return formatToolResult({
          horizon: input.horizon,
          buckets,
          progress,
          note:
            buckets.length > 0
              ? 'Mean forward return by the grade band at the time of grading, priced to today.'
              : progress.gradesRecorded === 0
                ? 'Nothing is being recorded yet. Grade something, or run investment_report, before expecting calibration.'
                : `${progress.gradesRecorded} grades across ${progress.tickersTracked} tickers; the oldest is ${plural(progress.oldestGradeAgeDays ?? 0, 'day')} old and the first observation matures in ${plural(progress.daysUntilFirstObservation ?? 0, 'day')}. Calibration needs elapsed time, not more grading.`,
        });
      }
      case 'universe':
        return formatToolResult({ tickers: loadUniverse() });
      case 'set_universe': {
        if (!input.tickers?.length) throw new Error('tickers is required for action "set_universe"');
        return formatToolResult({ tickers: saveUniverse(input.tickers) });
      }
    }
  },
});

export const SCREEN_UNIVERSE_DESCRIPTION = `
Screens your universe against numeric criteria using free data only.

## Why this exists
Both paid screeners are unavailable: financialdatasets.ai is out of credits and
FMP's screener is above the current plan. Grading already caches 133 metrics per
ticker for 24 hours, so screening those names costs little or nothing.

## Scope — say this to the user
It screens the **configured universe** (50 names by default), not the whole
market. A market-wide screen needs a bulk endpoint that no free tier provides.
If the user wants different names screened, change the universe with
\`score_history\` action \`set_universe\`, or pass \`tickers\` directly.

## Filters
Each filter is { metric, operator, value } with operator gt/gte/lt/lte/eq.
A metric the provider does not report counts as a FAIL, never a pass — so a
result is always a name that genuinely met every test.

Available metrics: pe, forward_pe, peg, ps, pb, ev_ebitda, dividend_yield,
payout_ratio, roe, roa, roic, gross_margin, operating_margin, net_margin,
revenue_growth, revenue_growth_5y, eps_growth, eps_growth_5y, debt_to_equity,
current_ratio, interest_coverage, market_cap, beta, return_52w.

Percentages are whole numbers (roe 25 means 25%), not fractions.
`.trim();

export const screenUniverseTool = new DynamicStructuredTool({
  name: 'screen_universe',
  description:
    'Screens the configured universe against numeric financial criteria (P/E, ROE, margins, growth, leverage) using free cached data. Use when the user asks to find or filter stocks by the numbers. Covers the universe, not the whole market — say so.',
  schema: z.object({
    filters: z
      .array(
        z.object({
          metric: z.string().describe('Metric name, e.g. "pe", "roe", "revenue_growth".'),
          operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
          value: z.number(),
        }),
      )
      .min(1)
      .describe('All filters must pass for a name to match.'),
    sort_by: z.string().optional().describe('Metric to sort matches by.'),
    descending: z.boolean().default(true),
    limit: z.number().int().min(1).max(50).default(20),
    tickers: z.array(z.string()).optional().describe('Screen this list instead of the saved universe.'),
  }),
  func: async (input) => {
    const { screenUniverse } = await import('../scoring/screen.js');
    const result = await screenUniverse({
      filters: input.filters as Array<{ metric: string; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number }>,
      sortBy: input.sort_by,
      descending: input.descending,
      limit: input.limit,
      universe: input.tickers,
    });
    return formatToolResult(result);
  },
});
