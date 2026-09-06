import { readFileSync } from 'node:fs';

/**
 * The health sweep names a free substitute for every paid-tier tool. If a tool
 * starts failing on plan limits and has no entry here, the operator is told
 * "behind your plan" and nothing else — which is where the previous version of
 * this project left people.
 */
const source = readFileSync('src/evals/provider-health.ts', 'utf-8');

function mapKeys(name: string): string[] {
  const start = source.indexOf(`const ${name}: Record<string, string> = {`);
  if (start === -1) return [];
  const end = source.indexOf('\n};', start);
  return [...source.slice(start, end).matchAll(/^\s{2}([a-z_0-9]+):/gm)].map((m) => m[1]);
}

describe('free substitutes', () => {
  const substitutes = mapKeys('SUBSTITUTES');

  test('every tool observed hitting a plan limit has a documented alternative', () => {
    // Names taken from real sweeps against the live accounts.
    const observed = [
      'get_financials', 'get_market_data', 'read_filings', 'stock_screener',
      'polygon_stock_snapshot', 'polygon_stock_aggregates', 'polygon_forex_snapshot',
      'finnhub_sentiment', 'fmp_stock_screener', 'eodhd_fundamentals', 'eodhd_eod_prices',
      'rentcast_rent_estimate', 'rentcast_value_estimate', 'realtor_properties_for_sale',
    ];
    for (const tool of observed) {
      expect(substitutes).toContain(tool);
    }
  });

  test('the paid capabilities that were replaced point at the free tools', () => {
    expect(source).toContain('sec_financials');
    expect(source).toContain('yahoo_quote');
    expect(source).toContain('screen_universe');
  });

  test('tools with genuinely no free equivalent say so rather than inventing one', () => {
    // Honesty matters more than completeness here.
    // Scope to the SUBSTITUTES block: the same tool names also appear in the
    // FIXTURES block above, and matching those instead proves nothing.
    const start = source.indexOf('const SUBSTITUTES: Record<string, string> = {');
    const block = source.slice(start, source.indexOf('\n};', start));
    for (const tool of ['rentcast_rent_estimate', 'realtor_properties_for_sale']) {
      const line = block.split('\n').find((l) => l.trim().startsWith(`${tool}:`)) ?? '';
      expect(line.toLowerCase()).toContain('no free equivalent');
    }
  });

  test('excluded tools carry a reason', () => {
    const excluded = mapKeys('EXCLUDED');
    expect(excluded.length).toBeGreaterThan(10);
    for (const tool of ['investment_report', 'run_debate', 'portfolio_add']) {
      expect(excluded).toContain(tool);
    }
  });
});
