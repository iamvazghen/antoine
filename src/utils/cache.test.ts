import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { buildCacheKey, readCache, writeCache } from './cache.js';
import { antoinePath } from './paths.js';

/**
 * Ask the resolver where the cache is rather than assuming.
 *
 * This used to hard-code '.antoine/cache'. antoinePath() prefers ./.antoine when
 * that directory exists and falls back to ~/.antoine when it does not - so on a
 * developer checkout the guess was right, and on a fresh CI checkout (.antoine is
 * gitignored) the test wrote a corrupt entry to ./.antoine/cache while readCache
 * looked in ~/.antoine/cache. The two corrupt-entry cases then failed on every
 * push for weeks, in the one environment nobody was watching.
 */
const TEST_CACHE_DIR = antoinePath('cache');

// ---------------------------------------------------------------------------
// buildCacheKey
// ---------------------------------------------------------------------------

describe('buildCacheKey', () => {
  test('produces the same key regardless of param insertion order', () => {
    const paramsA = { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31', interval: 'day', interval_multiplier: 1 };
    const paramsB = { interval_multiplier: 1, end_date: '2024-12-31', ticker: 'AAPL', interval: 'day', start_date: '2024-01-01' };
    expect(buildCacheKey('/prices/', paramsA)).toBe(buildCacheKey('/prices/', paramsB));
  });

  test('sorts array values without mutating the original', () => {
    const items = ['Item-7', 'Item-1', 'Item-1A'];
    const original = [...items];
    buildCacheKey('/filings/items/', { ticker: 'AAPL', item: items });
    expect(items).toEqual(original); // not mutated
  });

  test('produces different keys for different params', () => {
    const keyA = buildCacheKey('/prices/', { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-06-30' });
    const keyB = buildCacheKey('/prices/', { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31' });
    expect(keyA).not.toBe(keyB);
  });

  test('includes ticker prefix for readable filenames', () => {
    const key = buildCacheKey('/prices/', { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31' });
    expect(key).toMatch(/^prices\/AAPL_/);
    expect(key).toMatch(/\.json$/);
  });

  test('omits undefined and null params', () => {
    const keyA = buildCacheKey('/prices/', { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31', limit: undefined });
    const keyB = buildCacheKey('/prices/', { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31' });
    expect(keyA).toBe(keyB);
  });
});

// ---------------------------------------------------------------------------
// readCache / writeCache round-trip
// ---------------------------------------------------------------------------

describe('readCache / writeCache', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE_DIR)) {
      rmSync(TEST_CACHE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_CACHE_DIR)) {
      rmSync(TEST_CACHE_DIR, { recursive: true });
    }
  });

  test('round-trips data through write then read', () => {
    const endpoint = '/prices/';
    const params = { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31', interval: 'day', interval_multiplier: 1 };
    const data = { prices: [{ open: 100, close: 105, high: 106, low: 99 }] };
    const url = 'https://api.financialdatasets.ai/prices/?ticker=AAPL&start_date=2024-01-01&end_date=2024-12-31';

    writeCache(endpoint, params, data, url);
    const cached = readCache(endpoint, params);

    expect(cached).not.toBeNull();
    expect(cached!.data).toEqual(data);
    expect(cached!.url).toBe(url);
  });

  test('returns null on cache miss (no file)', () => {
    const cached = readCache('/prices/', { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31' });
    expect(cached).toBeNull();
  });

  test('returns null and removes file when cache entry is corrupted JSON', () => {
    const endpoint = '/prices/';
    const params = { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31', interval: 'day', interval_multiplier: 1 };

    const key = buildCacheKey(endpoint, params);
    const filepath = join(TEST_CACHE_DIR, key);
    const dir = join(TEST_CACHE_DIR, key.split('/')[0]!);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filepath, '{ broken json!!!');

    const cached = readCache(endpoint, params);
    expect(cached).toBeNull();
    expect(existsSync(filepath)).toBe(false);
  });

  test('returns null and removes file when cache entry has invalid structure', () => {
    const endpoint = '/prices/';
    const params = { ticker: 'AAPL', start_date: '2024-01-01', end_date: '2024-12-31', interval: 'day', interval_multiplier: 1 };

    const key = buildCacheKey(endpoint, params);
    const filepath = join(TEST_CACHE_DIR, key);
    const dir = join(TEST_CACHE_DIR, key.split('/')[0]!);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filepath, JSON.stringify({ wrong: 'shape' }));

    const cached = readCache(endpoint, params);
    expect(cached).toBeNull();
    expect(existsSync(filepath)).toBe(false);
  });
});
