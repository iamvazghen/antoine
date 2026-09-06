/**
 * A screener built on data we already pay nothing for.
 *
 * The paid screeners are both gone: financialdatasets.ai sits at a $0.00 balance
 * and FMP's screener is above this plan's tier. But grading already pulls 133
 * Finnhub metrics per ticker and caches them for 24 hours, so screening the
 * universe is mostly a matter of reading what is already on disk. A screen
 * immediately after a review costs close to nothing.
 *
 * Deliberately a universe screen, not a market screen. It answers "which of the
 * names I follow meet these criteria", not "which of 8,000 US listings" — the
 * latter needs a bulk endpoint nobody gives away. That limit is stated in the
 * tool description rather than hidden, because a screener that silently covers
 * 50 names while the user assumes 8,000 is worse than no screener.
 */
import { fetchBundle, metric, series, type TickerBundle } from './data.js';
import { mean } from './factors.js';
import { loadUniverse } from './report.js';

export type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface ScreenFilter {
  metric: string;
  operator: Operator;
  value: number;
}

/**
 * Metrics a screen can filter on, mapped to how they are read from a bundle.
 * Names are the plain-English ones a user would reach for, not the provider's.
 */
export const SCREEN_METRICS: Record<string, (b: TickerBundle) => number | null> = {
  pe: (b) => metric(b, 'peTTM'),
  forward_pe: (b) => metric(b, 'forwardPE'),
  peg: (b) => metric(b, 'forwardPEG') ?? metric(b, 'pegTTM'),
  ps: (b) => metric(b, 'psTTM'),
  pb: (b) => metric(b, 'pb'),
  ev_ebitda: (b) => metric(b, 'evEbitdaTTM'),
  dividend_yield: (b) => metric(b, 'currentDividendYieldTTM'),
  payout_ratio: (b) => metric(b, 'payoutRatioTTM'),

  roe: (b) => metric(b, 'roeTTM'),
  roa: (b) => metric(b, 'roaTTM'),
  roic: (b) => {
    const xs = series(b, 'roic', 5, true);
    return mean(xs);
  },
  gross_margin: (b) => metric(b, 'grossMarginTTM'),
  operating_margin: (b) => metric(b, 'operatingMarginTTM'),
  net_margin: (b) => metric(b, 'netProfitMarginTTM'),

  revenue_growth: (b) => metric(b, 'revenueGrowthTTMYoy'),
  revenue_growth_5y: (b) => metric(b, 'revenueGrowth5Y'),
  eps_growth: (b) => metric(b, 'epsGrowthTTMYoy'),
  eps_growth_5y: (b) => metric(b, 'epsGrowth5Y'),

  debt_to_equity: (b) => metric(b, 'totalDebt/totalEquityQuarterly'),
  current_ratio: (b) => metric(b, 'currentRatioQuarterly'),
  interest_coverage: (b) => metric(b, 'netInterestCoverageTTM'),

  market_cap: (b) => metric(b, 'marketCapitalization'),
  beta: (b) => metric(b, 'beta'),
  return_52w: (b) => metric(b, '52WeekPriceReturnDaily'),
};

export function listScreenMetrics(): string[] {
  return Object.keys(SCREEN_METRICS);
}

function passes(value: number | null, filter: ScreenFilter): boolean {
  if (value === null) return false;
  switch (filter.operator) {
    case 'gt':
      return value > filter.value;
    case 'gte':
      return value >= filter.value;
    case 'lt':
      return value < filter.value;
    case 'lte':
      return value <= filter.value;
    case 'eq':
      return value === filter.value;
  }
}

/** Evaluate one already-fetched bundle. Pure, so it is testable without network. */
export function evaluate(
  bundle: TickerBundle,
  filters: ScreenFilter[],
): { matched: boolean; values: Record<string, number | null>; missing: string[] } {
  const values: Record<string, number | null> = {};
  const missing: string[] = [];
  let matched = true;

  for (const filter of filters) {
    const read = SCREEN_METRICS[filter.metric];
    if (!read) {
      missing.push(filter.metric);
      matched = false;
      continue;
    }
    const value = read(bundle);
    values[filter.metric] = value;
    // A metric the provider does not report is not a pass. Treating a missing
    // value as satisfied would quietly return companies that fail the test.
    if (!passes(value, filter)) matched = false;
  }

  return { matched, values, missing };
}

export interface ScreenHit {
  ticker: string;
  values: Record<string, number | null>;
}

export interface ScreenResult {
  filters: ScreenFilter[];
  screened: number;
  matches: ScreenHit[];
  failed: string[];
  note: string;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function screenUniverse(options: {
  filters: ScreenFilter[];
  universe?: string[];
  sortBy?: string;
  descending?: boolean;
  limit?: number;
}): Promise<ScreenResult> {
  const tickers = options.universe ?? loadUniverse();
  const failed: string[] = [];

  const results = await mapLimited(tickers, 4, async (ticker) => {
    try {
      const bundle = await fetchBundle(ticker);
      const { matched, values } = evaluate(bundle, options.filters);
      return matched ? { ticker: bundle.ticker, values } : null;
    } catch {
      failed.push(ticker);
      return null;
    }
  });

  let matches = results.filter((r): r is ScreenHit => r !== null);

  const sortBy = options.sortBy;
  if (sortBy) {
    matches = matches.sort((a, b) => {
      const av = a.values[sortBy] ?? Number.NEGATIVE_INFINITY;
      const bv = b.values[sortBy] ?? Number.NEGATIVE_INFINITY;
      return options.descending === false ? av - bv : bv - av;
    });
  }

  if (options.limit) matches = matches.slice(0, options.limit);

  return {
    filters: options.filters,
    screened: tickers.length - failed.length,
    matches,
    failed,
    note: `Screened ${tickers.length - failed.length} names from the configured universe, not the whole market. Free data only — no screener subscription is active.`,
  };
}
