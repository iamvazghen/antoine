import { evaluate, listScreenMetrics, SCREEN_METRICS, type ScreenFilter } from './screen.js';
import type { TickerBundle } from './data.js';

function bundle(metric: Record<string, number>, series: Record<string, number[]> = {}): TickerBundle {
  return {
    ticker: 'TEST',
    gradedAs: 'TEST',
    asOf: '2026-09-07T00:00:00.000Z',
    metric,
    series: Object.fromEntries(
      Object.entries(series).map(([k, vals]) => [
        k,
        vals.map((v, i) => ({ period: `${2025 - i}-12-31`, v })),
      ]),
    ),
    prices: [],
    sources: [],
    missing: [],
  };
}

const f = (metric: string, operator: ScreenFilter['operator'], value: number): ScreenFilter => ({
  metric,
  operator,
  value,
});

describe('screen filters', () => {
  test('matches when every filter passes', () => {
    const b = bundle({ peTTM: 12, roeTTM: 28 });
    const r = evaluate(b, [f('pe', 'lt', 15), f('roe', 'gt', 20)]);
    expect(r.matched).toBe(true);
    expect(r.values.pe).toBe(12);
    expect(r.values.roe).toBe(28);
  });

  test('fails when any single filter fails', () => {
    const b = bundle({ peTTM: 12, roeTTM: 8 });
    expect(evaluate(b, [f('pe', 'lt', 15), f('roe', 'gt', 20)]).matched).toBe(false);
  });

  test('a metric the provider does not report is a FAIL, never a pass', () => {
    // Treating missing as satisfied would return companies that fail the test —
    // the worst possible outcome for a screener, since the user cannot see it.
    const b = bundle({ peTTM: 12 });
    const r = evaluate(b, [f('pe', 'lt', 15), f('dividend_yield', 'gt', 3)]);
    expect(r.matched).toBe(false);
    expect(r.values.dividend_yield).toBeNull();
  });

  test('an unknown metric name fails loudly rather than being ignored', () => {
    const r = evaluate(bundle({ peTTM: 12 }), [f('not_a_metric', 'gt', 1)]);
    expect(r.matched).toBe(false);
    expect(r.missing).toContain('not_a_metric');
  });

  test('every operator behaves', () => {
    const b = bundle({ peTTM: 20 });
    expect(evaluate(b, [f('pe', 'gt', 19)]).matched).toBe(true);
    expect(evaluate(b, [f('pe', 'gt', 20)]).matched).toBe(false);
    expect(evaluate(b, [f('pe', 'gte', 20)]).matched).toBe(true);
    expect(evaluate(b, [f('pe', 'lt', 21)]).matched).toBe(true);
    expect(evaluate(b, [f('pe', 'lte', 20)]).matched).toBe(true);
    expect(evaluate(b, [f('pe', 'eq', 20)]).matched).toBe(true);
  });

  test('roic reads the multi-year series, not a single snapshot', () => {
    const b = bundle({}, { roic: [0.2, 0.22, 0.18] });
    // Series values are fractions; the screen reports percentages.
    expect(SCREEN_METRICS.roic(b)).toBeCloseTo(20, 0);
    expect(evaluate(b, [f('roic', 'gt', 15)]).matched).toBe(true);
  });

  test('the advertised metric list resolves to real readers', () => {
    // The description promises these names; a typo there would be invisible.
    for (const name of listScreenMetrics()) {
      expect(typeof SCREEN_METRICS[name]).toBe('function');
    }
    for (const promised of ['pe', 'roe', 'roic', 'revenue_growth', 'debt_to_equity', 'market_cap']) {
      expect(listScreenMetrics()).toContain(promised);
    }
  });

  test('an empty bundle matches nothing', () => {
    expect(evaluate(bundle({}), [f('pe', 'lt', 100)]).matched).toBe(false);
  });
});
