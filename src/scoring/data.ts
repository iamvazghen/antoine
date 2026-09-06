/**
 * Data layer for the grading engine.
 *
 * Deliberately narrow: ONE fundamentals call and ONE price call per ticker, so
 * grading a 50-name universe costs 100 requests, not thousands. Both go through
 * `callProvider`, so a re-run inside the TTL is free.
 *
 * Provider choice is a consequence of what the account can actually reach
 * (verified 2026-09-06):
 *   - financialdatasets.ai .... DEAD, $0.00 balance ("Insufficient credits")
 *   - FMP legacy /api/v3 ...... DEAD, retired for non-legacy subscriptions
 *   - FMP /stable ............. alive but capped at limit<=5 annual periods
 *   - EODHD ................... EOD prices only on this plan, no fundamentals
 *   - Finnhub /stock/metric ... 133 snapshot metrics + ~26y of annual series
 *   - Tiingo daily prices ..... back to 1990 (36y)
 *
 * So the long-horizon factors are built on Finnhub's annual series and Tiingo's
 * price history, which is the deepest history reachable without a paid upgrade.
 */
import { callProvider, TTL_FUNDAMENTALS } from '../tools/finance/provider-call.js';

/** One point in an annual series. `v` is a FRACTION for margins/returns (0.32 = 32%). */
export interface SeriesPoint {
  period: string;
  v: number;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface TickerBundle {
  ticker: string;
  /** The US-listed symbol the fundamentals actually came from. */
  gradedAs: string;
  /** Set when `ticker` was a foreign listing and grading fell back to its US line. */
  listingNote?: string;
  asOf: string;
  /** Finnhub snapshot metrics. Margins/growth here are PERCENTAGES (33.17 = 33.17%). */
  metric: Record<string, number | string | null>;
  /** Finnhub annual series, newest first. Margins/returns are FRACTIONS. */
  series: Record<string, SeriesPoint[]>;
  /** Monthly closes, oldest first. Empty when the price provider was unreachable. */
  prices: PricePoint[];
  sources: string[];
  /** Sub-fetches that failed, so a grade can report reduced coverage honestly. */
  missing: string[];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Snapshot metric, already a percentage where the metric is a rate. */
export function metric(b: TickerBundle, key: string): number | null {
  return num(b.metric[key]);
}

/** First non-null snapshot metric among `keys`. */
export function metricAny(b: TickerBundle, keys: string[]): number | null {
  for (const k of keys) {
    const v = metric(b, k);
    if (v !== null) return v;
  }
  return null;
}

/**
 * Annual series values, newest first, capped at `years`. Fractions are converted
 * to percentages when `asPercent` is set so every factor works in one unit.
 */
export function series(
  b: TickerBundle,
  key: string,
  years: number,
  asPercent = false,
): number[] {
  const points = b.series[key] ?? [];
  const out: number[] = [];
  for (const p of points.slice(0, years)) {
    const v = num(p.v);
    if (v !== null) out.push(asPercent ? v * 100 : v);
  }
  return out;
}


/**
 * Resolve a foreign listing to the US line the fundamentals provider can serve.
 *
 * The fundamentals plan is US-only: SAP.DE, PETR4.SA and 0700.HK all come back
 * "You don't have access to this resource." Many large foreign companies are
 * cross-listed under the same root symbol (SAP.DE -> SAP, ASML.AS -> ASML), and
 * an exact-symbol match against the US symbol search is a reliable enough test
 * of that. Company-name search is not — "Petrobras" and "Nestle" both return
 * nothing — so this deliberately does not guess: it either finds an exact US
 * symbol or reports the limitation with something the user can act on.
 */
async function resolveUsListing(ticker: string): Promise<{ symbol: string; note?: string }> {
  const dot = ticker.indexOf('.');
  if (dot === -1) return { symbol: ticker };

  const suffix = ticker.slice(dot + 1);
  if (suffix === 'US') return { symbol: ticker.slice(0, dot) };

  const bare = ticker.slice(0, dot);
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error('FINNHUB_API_KEY is not set');

  try {
    const res = await callProvider({
      provider: 'finnhub',
      endpoint: 'symbol_search',
      params: { q: bare },
      url: `https://finnhub.io/api/v1/search?q=${encodeURIComponent(bare)}&exchange=US&token=${token}`,
      ttlMs: TTL_FUNDAMENTALS,
    });
    const results = ((res.data as { result?: Array<{ symbol?: string; description?: string; type?: string }> })
      .result ?? []);
    const exact = results.find((r) => r.symbol?.toUpperCase() === bare);
    if (exact?.symbol) {
      return {
        symbol: exact.symbol.toUpperCase(),
        note: `${ticker} is not covered by the fundamentals plan (US listings only); graded the US line ${exact.symbol.toUpperCase()}${exact.type ? ` (${exact.type})` : ''} instead. Prices and multiples are the US-listed ones.`,
      };
    }
  } catch {
    // Fall through to the explicit error below — a failed lookup should not
    // masquerade as "no such company".
  }

  throw new Error(
    `Fundamental grading covers US-listed securities only on the current data plan, and no US listing was found for ${ticker}. ` +
      `Grade its US ADR directly if it has one (for example PBR for PETR4.SA, TCEHY for 0700.HK, NSRGY for NESN.SW), ` +
      `or use get_global_stock for price and market data on the local line.`,
  );
}

async function fetchFinnhub(ticker: string): Promise<{
  metric: Record<string, number | string | null>;
  series: Record<string, SeriesPoint[]>;
  url: string;
}> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error('FINNHUB_API_KEY is not set');

  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${token}`;
  const res = await callProvider({
    provider: 'finnhub',
    endpoint: 'metric_all',
    params: { symbol: ticker },
    url,
    ttlMs: TTL_FUNDAMENTALS,
  });

  const data = res.data as {
    metric?: Record<string, number | string | null>;
    series?: { annual?: Record<string, SeriesPoint[]> };
  };
  const m = data.metric ?? {};
  if (Object.keys(m).length === 0) {
    throw new Error(`no fundamentals returned for ${ticker}`);
  }
  // Redact the token from the URL we surface as a source.
  return { metric: m, series: data.series?.annual ?? {}, url: url.replace(token, '***') };
}

async function fetchPrices(ticker: string): Promise<{ prices: PricePoint[]; url: string }> {
  const token = process.env.TIINGO_API_KEY;
  if (!token) throw new Error('TIINGO_API_KEY is not set');

  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}/prices?token=${token}&startDate=1990-01-01&resampleFreq=monthly`;
  const res = await callProvider({
    provider: 'tiingo',
    endpoint: 'monthly_prices',
    params: { ticker },
    url,
    ttlMs: TTL_FUNDAMENTALS,
  });

  // callProvider wraps a top-level array as { value: [...] }.
  const raw = Array.isArray(res.data) ? res.data : (res.data.value as unknown);
  const rows = Array.isArray(raw) ? raw : [];
  const prices = rows
    .map((r) => {
      const row = r as { date?: string; adjClose?: number; close?: number };
      const close = num(row.adjClose) ?? num(row.close);
      return row.date && close !== null ? { date: row.date.slice(0, 10), close } : null;
    })
    .filter((p): p is PricePoint => p !== null);

  if (prices.length === 0) throw new Error(`no price history for ${ticker}`);
  return { prices, url: url.replace(token, '***') };
}

/**
 * Build the grading bundle. Fundamentals are required; price history is
 * optional — without it the through-cycle factor drops out and coverage falls,
 * which the grade reports rather than hides.
 */
export async function fetchBundle(ticker: string): Promise<TickerBundle> {
  const t = ticker.trim().toUpperCase();
  const listing = await resolveUsListing(t);
  const graded = listing.symbol;

  const [fund, priceResult] = await Promise.all([
    fetchFinnhub(graded),
    fetchPrices(graded).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err)))),
  ]);

  const priceOk = !(priceResult instanceof Error);
  return {
    ticker: t,
    gradedAs: graded,
    listingNote: listing.note,
    asOf: new Date().toISOString(),
    metric: fund.metric,
    series: fund.series,
    prices: priceOk ? priceResult.prices : [],
    sources: [fund.url, ...(priceOk ? [priceResult.url] : [])],
    missing: priceOk ? [] : [`price history (${priceResult.message})`],
  };
}

/** Latest close, used to stamp the score record for forward-return calibration. */
export function latestPrice(b: TickerBundle): number | null {
  return b.prices.length > 0 ? b.prices[b.prices.length - 1].close : null;
}
