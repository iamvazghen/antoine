/**
 * Portfolio tools. Four actions: view, add, remove, journal.
 *
 * The agent sees one tool per action (not a single tool with action=).
 * Each tool has its own focused Zod schema, which LangChain tool-calling
 * handles better than a fat union.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { PortfolioStore, type Position, type Conviction } from './store.js';

const PORTFOLIO_VIEW_DESCRIPTION = `
Read the user's portfolio. Returns open positions, recent closed positions,
and journal entries.

Use this:
- ALWAYS before giving personalized financial advice
- Before sizing a new position (the position-sizing skill calls this)
- Before writing a trade-review or memo that references current holdings
- When the user asks "what do I own" or "what's my exposure to X"

The view is structured JSON; format a friendly summary in your response.
`.trim();

const PORTFOLIO_ADD_DESCRIPTION = `
Add a new open position to the portfolio. The agent should confirm with the
user before calling this — adding a position is a real, durable state change.

Required: ticker, shares, avg_cost, currency, opened (YYYY-MM-DD), thesis,
conviction.
Optional: target_price, stop_loss, size_rationale.

If the user has not supplied a target_price or stop_loss, ask. Don't write
zeros — those are not stops.
`.trim();

const PORTFOLIO_REMOVE_DESCRIPTION = `
Close an existing open position. Move it to the closed-history list with the
exit price, realized P&L, and (optionally) a lesson learned.

If the user does not supply a lesson, prompt them. Closing a trade without
recording what you learned is wasted alpha.
`.trim();

const PORTFOLIO_JOURNAL_DESCRIPTION = `
Append a free-form note to the journal. Use for observations, trade ideas,
post-mortems, sector notes — anything the user wants the agent to remember
across sessions.

The portfolio journal is separate from MEMORY.md (long-term memory) and the
daily memory log. Use it specifically for portfolio-related context.
`.trim();

const PORTFOLIO_SET_RISK_DESCRIPTION = `
Set the user's risk profile (total capital USD, max % per trade, max
drawdown tolerance). The position-sizing skill reads this.

If the user has not stated a risk profile, ask. Don't assume 1% / 20% drawdown
— that's a hedge fund default, not everyone.
`.trim();

const store = new PortfolioStore();

export const portfolioView = new DynamicStructuredTool({
  name: 'portfolio_view',
  description: PORTFOLIO_VIEW_DESCRIPTION,
  schema: z.object({}),
  func: async () => {
    const p = store.read();
    return formatToolResult({
      total_capital_usd: p.total_capital_usd,
      risk_budget_pct: p.risk_budget_pct,
      max_drawdown_pct: p.max_drawdown_pct,
      open_positions: p.positions,
      open_count: p.positions.length,
      closed_count: p.closed.length,
      recent_closed: p.closed.slice(0, 5),
      recent_journal: p.journal.slice(0, 5),
      notes: p.notes,
      updated: p.updated,
    });
  },
});

export const portfolioAdd = new DynamicStructuredTool({
  name: 'portfolio_add',
  description: PORTFOLIO_ADD_DESCRIPTION,
  schema: z.object({
    ticker: z.string().describe('Ticker symbol (e.g., "AAPL" or "VOD.LSE" for non-US).'),
    shares: z.number().describe('Number of shares (negative for short).'),
    avg_cost: z.number().describe('Average cost per share in local currency.'),
    currency: z.string().default('USD').describe('Local currency code (e.g., USD, GBp, JPY).'),
    opened: z.string().describe('Date opened in YYYY-MM-DD.'),
    thesis: z.string().describe('One-sentence reason for the position.'),
    conviction: z.enum(['low', 'med', 'high'] as const).describe('Conviction in the thesis.'),
    target_price: z.number().optional().describe('Target price (optional).'),
    stop_loss: z.number().optional().describe('Stop loss (optional).'),
    size_rationale: z.string().optional().describe('Why this size (optional).'),
  }),
  func: async (input) => {
    const pos: Position = {
      ticker: input.ticker.toUpperCase(),
      shares: input.shares,
      avg_cost: input.avg_cost,
      currency: input.currency.toUpperCase(),
      opened: input.opened,
      thesis: input.thesis,
      conviction: input.conviction as Conviction,
      target_price: input.target_price,
      stop_loss: input.stop_loss,
      size_rationale: input.size_rationale,
    };
    try {
      const p = store.addPosition(pos);
      return formatToolResult({ ok: true, position: pos, total_open: p.positions.length });
    } catch (error) {
      return formatToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
});

export const portfolioRemove = new DynamicStructuredTool({
  name: 'portfolio_remove',
  description: PORTFOLIO_REMOVE_DESCRIPTION,
  schema: z.object({
    ticker: z.string().describe('Ticker of the position to close.'),
    exit_price: z.number().describe('Exit price per share.'),
    closed: z.string().describe('Closing date YYYY-MM-DD.'),
    lesson: z.string().default('').describe('What you learned (encouraged but optional).'),
  }),
  func: async (input) => {
    const upper = input.ticker.toUpperCase();
    return formatToolResult(
      store.update((p) => {
        const idx = p.positions.findIndex((x) => x.ticker.toUpperCase() === upper);
        if (idx === -1) {
          throw new Error(`No open position in ${upper}.`);
        }
        const pos = p.positions[idx];
        const realizedPnl = pos.shares * (input.exit_price - pos.avg_cost);
        const realizedPnlPct = pos.avg_cost === 0 ? 0 : ((input.exit_price - pos.avg_cost) / pos.avg_cost) * 100;
        const closed = {
          ...pos,
          closed: input.closed,
          exit_price: input.exit_price,
          realized_pnl: realizedPnl,
          realized_pnl_pct: realizedPnlPct,
          lesson: input.lesson,
        };
        return {
          ...p,
          positions: p.positions.filter((_, i) => i !== idx),
          closed: [closed, ...p.closed],
        };
      }),
    );
  },
});

export const portfolioJournal = new DynamicStructuredTool({
  name: 'portfolio_journal',
  description: PORTFOLIO_JOURNAL_DESCRIPTION,
  schema: z.object({
    text: z.string().describe('Free-form journal entry.'),
    category: z.enum(['observation', 'trade', 'idea', 'lesson'] as const).optional(),
  }),
  func: async (input) => {
    return formatToolResult(
      store.update((p) => ({
        ...p,
        journal: [
          {
            date: new Date().toISOString().slice(0, 10),
            text: input.text,
            category: input.category,
          },
          ...p.journal,
        ],
      })),
    );
  },
});

export const portfolioSetRisk = new DynamicStructuredTool({
  name: 'portfolio_set_risk',
  description: PORTFOLIO_SET_RISK_DESCRIPTION,
  schema: z.object({
    total_capital_usd: z.number().optional().describe('Total capital under management in USD.'),
    risk_budget_pct: z.number().optional().describe('Max % of capital to risk on a single new position (e.g., 1.0 = 1%).'),
    max_drawdown_pct: z.number().optional().describe('Max portfolio drawdown before forced de-risk (e.g., 20.0 = 20%).'),
  }),
  func: async (input) => {
    return formatToolResult(
      store.update((p) => ({
        ...p,
        ...(input.total_capital_usd !== undefined ? { total_capital_usd: input.total_capital_usd } : {}),
        ...(input.risk_budget_pct !== undefined ? { risk_budget_pct: input.risk_budget_pct } : {}),
        ...(input.max_drawdown_pct !== undefined ? { max_drawdown_pct: input.max_drawdown_pct } : {}),
      })),
    );
  },
});