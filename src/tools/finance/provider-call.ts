/**
 * Shared provider-call wrapper. Every roadmap finance/news provider should
 * funnel through this so we get:
 *   - Local disk cache (readCache/writeCache) keyed by `provider:endpoint`
 *   - Freshness stamps (asOf timestamp, ttlSec, cached flag) on every result
 *   - Consistent error logging via fetchJson
 *
 * Phase A work — collapses 15 provider files into a single calling convention
 * so the agent can reason about data provenance without each provider rolling
 * its own.
 */
import { fetchJson, TTL_24H, TTL_15M, TTL_1H } from './utils.js';
import { readCache, writeCache } from '../../utils/cache.js';

export interface ProviderResult {
  /** Raw response data from the provider (already JSON-parsed). */
  data: Record<string, unknown>;
  /** Source URLs surfaced back to the agent (typically the API call URL). */
  sourceUrls: string[];
  /** Provider name (e.g. "polygon", "alphavantage"). */
  provider: string;
  /** ISO timestamp of when the data was fetched (or restored from cache). */
  asOf: string;
  /** Cache TTL in seconds — useful for "data freshness" displays. */
  ttlSec: number;
  /** True if the result was served from local disk cache. */
  cached: boolean;
}

export interface ProviderCallOptions {
  /** Provider name for logging + cache-key prefix. */
  provider: string;
  /** Logical endpoint key (e.g. "quote", "time_series_daily", "income_statement"). */
  endpoint: string;
  /** Stable cache key params — typically the tool's input args. */
  params: Record<string, string | number | string[] | undefined>;
  /** The fully-built request URL. */
  url: string;
  /** Cache TTL in milliseconds. Defaults to 24h. */
  ttlMs?: number;
  /** Optional POST body. When present the call uses POST. */
  body?: Record<string, unknown>;
  /** Optional extra headers (e.g. auth tokens). */
  headers?: Record<string, string>;
}

/** Sensible TTLs by data class. */
export const TTL_NEWS = TTL_15M;
export const TTL_FUNDAMENTALS = TTL_24H;
export const TTL_EOD_PRICES = TTL_24H;
export const TTL_INTRADAY_QUOTE = TTL_15M;
export const TTL_LONG_TERM = TTL_24H;

/**
 * Make a provider call through the local cache. Returns a ProviderResult with
 * freshness metadata. Cache key = `${provider}:${endpoint}` + sorted params.
 */
export async function callProvider(opts: ProviderCallOptions): Promise<ProviderResult> {
  const ttlMs = opts.ttlMs ?? TTL_24H;
  const cacheKey = `${opts.provider}:${opts.endpoint}`;

  const cached = readCache(cacheKey, opts.params, ttlMs);
  if (cached) {
    return {
      data: cached.data,
      sourceUrls: [cached.url],
      provider: opts.provider,
      asOf: new Date().toISOString(),
      ttlSec: Math.round(ttlMs / 1000),
      cached: true,
    };
  }

  const init: RequestInit = {
    method: opts.body ? 'POST' : 'GET',
    headers: { ...(opts.headers ?? {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  };

  const raw = await fetchJson(opts.url, opts.provider, init);
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : { value: raw as unknown };

  writeCache(cacheKey, opts.params, data, opts.url);

  return {
    data,
    sourceUrls: [opts.url],
    provider: opts.provider,
    asOf: new Date().toISOString(),
    ttlSec: Math.round(ttlMs / 1000),
    cached: false,
  };
}

/**
 * Run a sequence of provider calls in order; return the first success. All
 * providers in the chain must return the same shape. If every provider
 * throws, surface every error in the final message.
 *
 * Used by the meta-tool routers to build provider fallback chains (e.g.
 * "Polygon → Finnhub → FMP → Financial Datasets" for a US stock quote).
 */
export async function withProviderFallback<T>(
  providers: Array<{ name: string; call: () => Promise<T> }>,
): Promise<T> {
  const errors: string[] = [];
  for (const p of providers) {
    try {
      return await p.call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${p.name}: ${message}`);
    }
  }
  throw new Error(`All providers failed: ${errors.join(' | ')}`);
}