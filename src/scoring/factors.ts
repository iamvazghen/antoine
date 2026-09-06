/**
 * The factor set. Every sub-score is computed in CODE, not asked of the LLM,
 * because a grade is only useful if the same inputs give the same number in
 * March and in September. An LLM asked "score this 0-100" will not do that.
 *
 * Two horizons, deliberately different questions:
 *   short (1-3y)  - will this re-rate? growth, cheapness vs its own history,
 *                   momentum, and not blowing up before the thesis plays out.
 *   long  (20y+)  - will this still compound? durability of returns on capital,
 *                   margin persistence, survivability, reinvestment, and how it
 *                   behaved through the crises already in the record.
 *
 * Weights are relative and renormalised over whatever actually scored, so a
 * missing field costs coverage rather than silently scoring zero.
 */
import { metric, metricAny, series, type TickerBundle } from './data.js';

export type Horizon = 'short' | 'long';

export interface Factor {
  id: string;
  label: string;
  /** 0-100 sub-score, or null when the inputs are unavailable. */
  score(b: TickerBundle): number | null;
  /** Raw evidence behind the sub-score, for the report. */
  detail(b: TickerBundle): string;
  weights: Record<Horizon, number>;
}

// ---------------------------------------------------------------- curves

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Linear ramp: `lo` scores 0, `hi` scores 100. Works inverted when lo > hi. */
export function band(v: number | null, lo: number, hi: number): number | null {
  if (v === null) return null;
  return clamp(((v - lo) / (hi - lo)) * 100);
}

/** Average the sub-scores that exist; null when none do. */
export function blend(parts: Array<number | null>, weights?: number[]): number | null {
  let sum = 0;
  let wsum = 0;
  parts.forEach((p, i) => {
    if (p === null) return;
    const w = weights?.[i] ?? 1;
    sum += p * w;
    wsum += w;
  });
  return wsum > 0 ? sum / wsum : null;
}

export function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function stdev(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Where today's multiple sits inside its own history. Cheap relative to its own
 * past scores high. Comparing the company against itself rather than a peer set
 * avoids needing a sector map, and it is the comparison that actually drives a
 * 1-3y re-rating.
 */
export function cheapVsOwnHistory(current: number | null, history: number[]): number | null {
  if (current === null || current <= 0) return null;
  const valid = history.filter((h) => h > 0);
  if (valid.length < 4) return null;
  const dearer = valid.filter((h) => h > current).length;
  return clamp((dearer / valid.length) * 100);
}

/** Worst peak-to-trough fall in the monthly closes, as a negative percentage. */
export function maxDrawdown(prices: Array<{ close: number }>): number | null {
  if (prices.length < 24) return null;
  let peak = prices[0].close;
  let worst = 0;
  for (const p of prices) {
    if (p.close > peak) peak = p.close;
    const dd = (p.close - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst * 100;
}

function fmt(v: number | null, unit = '', digits = 1): string {
  return v === null ? 'n/a' : `${v.toFixed(digits)}${unit}`;
}

// ---------------------------------------------------------------- factors

export const FACTORS: Factor[] = [
  // ------------------------------------------------------------ short horizon
  {
    id: 'valuation_vs_own_history',
    label: 'Valuation vs its own history',
    weights: { short: 18, long: 8 },
    score: (b) => {
      // P/E first; a loss-making year makes P/E meaningless, so fall back to
      // P/S and then P/B rather than scoring the company as "expensive".
      const pe = cheapVsOwnHistory(metricAny(b, ['peTTM', 'peExclExtraTTM']), series(b, 'pe', 12));
      if (pe !== null) return pe;
      const ps = cheapVsOwnHistory(metric(b, 'psTTM'), series(b, 'ps', 12));
      if (ps !== null) return ps;
      return cheapVsOwnHistory(metricAny(b, ['pb', 'pbQuarterly']), series(b, 'pb', 12));
    },
    detail: (b) => {
      const pe = metricAny(b, ['peTTM', 'peExclExtraTTM']);
      const hist = series(b, 'pe', 12);
      return `P/E ${fmt(pe)} vs ${hist.length}y median ${fmt(median(hist))}`;
    },
  },
  {
    id: 'forward_valuation',
    label: 'Growth-adjusted price (PEG)',
    weights: { short: 10, long: 0 },
    score: (b) => band(metricAny(b, ['forwardPEG', 'pegTTM']), 3.0, 0.8),
    detail: (b) => `PEG ${fmt(metricAny(b, ['forwardPEG', 'pegTTM']), '', 2)}`,
  },
  {
    id: 'revenue_growth',
    label: 'Revenue growth (TTM YoY)',
    weights: { short: 12, long: 0 },
    score: (b) => band(metricAny(b, ['revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy']), -5, 25),
    detail: (b) =>
      `${fmt(metricAny(b, ['revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy']), '%')} YoY`,
  },
  {
    id: 'eps_growth',
    label: 'EPS growth (TTM YoY)',
    weights: { short: 12, long: 0 },
    score: (b) => band(metricAny(b, ['epsGrowthTTMYoy', 'epsGrowthQuarterlyYoy']), -10, 30),
    detail: (b) => `${fmt(metricAny(b, ['epsGrowthTTMYoy', 'epsGrowthQuarterlyYoy']), '%')} YoY`,
  },
  {
    id: 'margin_trend',
    label: 'Margin direction vs 5y average',
    weights: { short: 10, long: 0 },
    score: (b) => {
      const now = metric(b, 'operatingMarginTTM');
      const avg = metric(b, 'operatingMargin5Y');
      if (now === null || avg === null) return null;
      return band(now - avg, -3, 3);
    },
    detail: (b) =>
      `op margin ${fmt(metric(b, 'operatingMarginTTM'), '%')} vs 5y avg ${fmt(metric(b, 'operatingMargin5Y'), '%')}`,
  },
  {
    id: 'price_momentum',
    label: '12-month price momentum',
    weights: { short: 10, long: 0 },
    score: (b) => band(metric(b, '52WeekPriceReturnDaily'), -20, 40),
    detail: (b) => `${fmt(metric(b, '52WeekPriceReturnDaily'), '%')} over 52w`,
  },
  {
    id: 'relative_strength',
    label: 'Relative strength vs S&P 500',
    weights: { short: 8, long: 0 },
    score: (b) => band(metric(b, 'priceRelativeToS&P50052Week'), -20, 20),
    detail: (b) => `${fmt(metric(b, 'priceRelativeToS&P50052Week'), '%')} vs index, 52w`,
  },
  {
    id: 'profitability_now',
    label: 'Current return on equity',
    weights: { short: 8, long: 0 },
    score: (b) => band(metricAny(b, ['roeTTM', 'roeRfy']), 5, 30),
    detail: (b) => `ROE ${fmt(metricAny(b, ['roeTTM', 'roeRfy']), '%')}`,
  },
  {
    id: 'balance_sheet_safety',
    label: 'Balance-sheet safety (current)',
    weights: { short: 12, long: 0 },
    score: (b) =>
      blend([
        band(metric(b, 'netInterestCoverageTTM'), 2, 12),
        band(metric(b, 'currentRatioQuarterly'), 0.8, 2.0),
        band(metric(b, 'totalDebt/totalEquityQuarterly'), 2.5, 0.2),
      ]),
    detail: (b) =>
      `int cover ${fmt(metric(b, 'netInterestCoverageTTM'), 'x')}, current ${fmt(metric(b, 'currentRatioQuarterly'), '', 2)}, D/E ${fmt(metric(b, 'totalDebt/totalEquityQuarterly'), '', 2)}`,
  },

  // ------------------------------------------------------------ long horizon
  {
    id: 'roic_durability',
    label: 'Return on invested capital, through the cycle',
    weights: { short: 0, long: 16 },
    score: (b) => band(mean(series(b, 'roic', 20, true)), 5, 25),
    detail: (b) => {
      const xs = series(b, 'roic', 20, true);
      return `mean ROIC ${fmt(mean(xs), '%')} over ${xs.length}y`;
    },
  },
  {
    id: 'roic_stability',
    label: 'Consistency of returns on capital',
    weights: { short: 0, long: 8 },
    score: (b) => {
      const xs = series(b, 'roic', 20, true);
      const m = mean(xs);
      const sd = stdev(xs);
      if (m === null || sd === null || m <= 0) return null;
      // Coefficient of variation: a business earning 18% every year beats one
      // averaging 18% by alternating 40% and -4%.
      return band(sd / m, 0.6, 0.15);
    },
    detail: (b) => {
      const xs = series(b, 'roic', 20, true);
      const m = mean(xs);
      const sd = stdev(xs);
      return m !== null && sd !== null && m > 0
        ? `variation ${(sd / m).toFixed(2)} over ${xs.length}y`
        : 'n/a';
    },
  },
  {
    id: 'margin_durability',
    label: 'Operating-margin durability',
    weights: { short: 0, long: 12 },
    score: (b) => {
      const xs = series(b, 'operatingMargin', 20, true);
      const level = band(mean(xs), 5, 30);
      // Recent half vs older half: is the moat widening or eroding?
      const half = Math.ceil(xs.length / 2);
      const recent = mean(xs.slice(0, half));
      const older = mean(xs.slice(half));
      const trend = recent !== null && older !== null ? band(recent - older, -6, 6) : null;
      return blend([level, trend], [0.7, 0.3]);
    },
    detail: (b) => {
      const xs = series(b, 'operatingMargin', 20, true);
      return `mean ${fmt(mean(xs), '%')} over ${xs.length}y`;
    },
  },
  {
    id: 'cash_conversion',
    label: 'Free-cash-flow conversion',
    weights: { short: 0, long: 10 },
    score: (b) => band(mean(series(b, 'fcfMargin', 20, true)), 2, 20),
    detail: (b) => {
      const xs = series(b, 'fcfMargin', 20, true);
      return `mean FCF margin ${fmt(mean(xs), '%')} over ${xs.length}y`;
    },
  },
  {
    id: 'survivability',
    label: 'Balance-sheet survivability (long record)',
    weights: { short: 0, long: 12 },
    score: (b) =>
      blend([
        band(mean(series(b, 'totalDebtToTotalCapital', 20, true)), 70, 20),
        band(metricAny(b, ['netInterestCoverageAnnual', 'netInterestCoverageTTM']), 2, 12),
        band(mean(series(b, 'currentRatio', 20)), 0.8, 2.0),
      ]),
    detail: (b) =>
      `debt/capital ${fmt(mean(series(b, 'totalDebtToTotalCapital', 20, true)), '%')}, int cover ${fmt(metricAny(b, ['netInterestCoverageAnnual', 'netInterestCoverageTTM']), 'x')}`,
  },
  {
    id: 'reinvestment_runway',
    label: 'Reinvestment and compounding runway',
    weights: { short: 0, long: 10 },
    score: (b) =>
      blend([
        band(metricAny(b, ['revenueGrowth5Y', 'revenueGrowth3Y']), 0, 15),
        band(metric(b, 'focfCagr5Y'), 0, 15),
        band(metric(b, 'ebitdaCagr5Y'), 0, 15),
      ]),
    detail: (b) =>
      `revenue 5y ${fmt(metric(b, 'revenueGrowth5Y'), '%')}, FCF 5y ${fmt(metric(b, 'focfCagr5Y'), '%')}`,
  },
  {
    id: 'capital_allocation',
    label: 'Capital allocation',
    weights: { short: 0, long: 8 },
    score: (b) => {
      // A payout above ~80% of earnings leaves nothing to reinvest and is the
      // usual precursor to a cut; a zero payout is fine if book value compounds.
      const payout = mean(series(b, 'payoutRatio', 12, true));
      const payoutScore = payout === null ? null : payout > 80 ? band(payout, 130, 80) : 100;
      return blend([
        payoutScore,
        band(metric(b, 'bookValueShareGrowth5Y'), 0, 15),
        band(metric(b, 'dividendGrowthRate5Y'), 0, 10),
      ]);
    },
    detail: (b) =>
      `payout ${fmt(mean(series(b, 'payoutRatio', 12, true)), '%')}, book value/share 5y ${fmt(metric(b, 'bookValueShareGrowth5Y'), '%')}`,
  },
  {
    id: 'through_cycle_resilience',
    label: 'Behaviour through past crises',
    weights: { short: 0, long: 10 },
    score: (b) => {
      const dd = maxDrawdown(b.prices);
      if (dd === null) return null;
      // Did it make a new high after the worst fall? That is the evidence a
      // 20-year holder actually needs, and only long history shows it.
      const peak = Math.max(...b.prices.map((p) => p.close));
      const last = b.prices[b.prices.length - 1].close;
      const recovery = band((last / peak) * 100, 40, 100);
      return blend([band(dd, -80, -25), recovery], [0.6, 0.4]);
    },
    detail: (b) => {
      const dd = maxDrawdown(b.prices);
      const years = b.prices.length / 12;
      return dd === null
        ? 'no price history'
        : `max drawdown ${fmt(dd, '%')} across ${years.toFixed(0)}y`;
    },
  },
  {
    id: 'longevity',
    label: 'Length of the public record',
    weights: { short: 0, long: 6 },
    // No record at all means unknown, not "newly listed" — scoring that as 0
    // would penalise a data gap exactly like a two-year-old company.
    score: (b) => (recordYears(b) > 0 ? band(recordYears(b), 5, 25) : null),
    detail: (b) => (recordYears(b) > 0 ? `${recordYears(b).toFixed(0)}y of record` : 'n/a'),
  },
];

function recordYears(b: TickerBundle): number {
  return Math.max(series(b, 'roic', 40).length, b.prices.length / 12);
}
