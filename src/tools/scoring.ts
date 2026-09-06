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
import { gradeTicker, readLedger, calibration } from '../scoring/grade.js';
import { loadUniverse, saveUniverse, runUniverseReport } from '../scoring/report.js';

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
        const buckets = calibration(input.horizon);
        return formatToolResult({
          horizon: input.horizon,
          buckets,
          note:
            buckets.length === 0
              ? 'No grade is yet 30 days old with a price on both ends. Calibration needs elapsed time, not more grading.'
              : 'Mean forward return by the grade band at the time of grading.',
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
