import { band, cheapVsOwnHistory, maxDrawdown, blend, FACTORS } from './factors.js';
import { gradeBundle, verdictFor } from './grade.js';
import type { TickerBundle } from './data.js';

/** Minimal bundle builder — only the fields a given assertion needs. */
function bundle(over: Partial<TickerBundle> = {}): TickerBundle {
  return {
    ticker: 'TEST',
    gradedAs: 'TEST',
    asOf: '2026-09-06T00:00:00.000Z',
    metric: {},
    series: {},
    prices: [],
    sources: [],
    missing: [],
    ...over,
  };
}

function annual(values: number[]): Array<{ period: string; v: number }> {
  return values.map((v, i) => ({ period: `${2025 - i}-12-31`, v }));
}

describe('curves', () => {
  test('band ramps between lo and hi and clamps outside', () => {
    expect(band(0, 0, 10)).toBe(0);
    expect(band(10, 0, 10)).toBe(100);
    expect(band(5, 0, 10)).toBe(50);
    expect(band(-99, 0, 10)).toBe(0);
    expect(band(999, 0, 10)).toBe(100);
  });

  test('band works inverted (lower is better)', () => {
    expect(band(0.2, 2.5, 0.2)).toBe(100);
    expect(band(2.5, 2.5, 0.2)).toBe(0);
  });

  test('band returns null for missing input rather than zero', () => {
    expect(band(null, 0, 10)).toBeNull();
  });

  test('cheapVsOwnHistory scores a cheap multiple high', () => {
    // Trading at 10 when history is 20-50 -> everything was dearer -> 100.
    expect(cheapVsOwnHistory(10, [20, 30, 40, 50])).toBe(100);
    expect(cheapVsOwnHistory(60, [20, 30, 40, 50])).toBe(0);
    expect(cheapVsOwnHistory(35, [20, 30, 40, 50])).toBe(50);
  });

  test('cheapVsOwnHistory refuses a negative multiple and a thin history', () => {
    expect(cheapVsOwnHistory(-8, [20, 30, 40, 50])).toBeNull();
    expect(cheapVsOwnHistory(10, [20, 30])).toBeNull();
  });

  test('maxDrawdown finds the worst peak-to-trough fall', () => {
    const prices = Array.from({ length: 30 }, (_, i) => ({ close: i === 15 ? 50 : 100 }));
    expect(maxDrawdown(prices)).toBeCloseTo(-50, 5);
  });

  test('maxDrawdown needs enough history to mean anything', () => {
    expect(maxDrawdown([{ close: 100 }, { close: 50 }])).toBeNull();
  });

  test('blend ignores missing parts instead of averaging them as zero', () => {
    expect(blend([100, null, 50])).toBe(75);
    expect(blend([null, null])).toBeNull();
  });
});

describe('grading', () => {
  test('a missing factor costs coverage, it does not score zero', () => {
    // Only one short-horizon factor has data: momentum, at full marks.
    const g = gradeBundle(bundle({ metric: { '52WeekPriceReturnDaily': 40 } }));
    expect(g.short.score).toBe(100);
    expect(g.short.coverage).toBeLessThan(20);
    expect(g.short.missing.length).toBeGreaterThan(5);
  });

  test('an empty bundle grades zero with zero coverage, not a false positive', () => {
    const g = gradeBundle(bundle());
    expect(g.short.coverage).toBe(0);
    expect(g.long.coverage).toBe(0);
  });

  test('the same inputs always give the same score', () => {
    const b = bundle({
      metric: { peTTM: 12, roeTTM: 25, revenueGrowthTTMYoy: 18 },
      series: { pe: annual([30, 28, 25, 22, 20]), roic: annual([0.2, 0.19, 0.21, 0.18, 0.2]) },
    });
    expect(gradeBundle(b).short.score).toBe(gradeBundle(b).short.score);
    expect(gradeBundle(b).long.score).toBe(gradeBundle(b).long.score);
  });

  test('a durable high-ROIC business outgrades a weak one on the long horizon', () => {
    const durable = bundle({
      series: {
        roic: annual([0.22, 0.21, 0.23, 0.2, 0.22, 0.21, 0.2, 0.22, 0.21, 0.2]),
        operatingMargin: annual([0.3, 0.29, 0.31, 0.3, 0.3, 0.29, 0.3, 0.31, 0.3, 0.29]),
        fcfMargin: annual([0.2, 0.19, 0.21, 0.2, 0.2]),
      },
    });
    const weak = bundle({
      series: {
        roic: annual([0.04, -0.02, 0.09, 0.01, 0.06, -0.05, 0.08, 0.02, 0.03, 0.01]),
        operatingMargin: annual([0.05, 0.02, 0.07, 0.01, 0.04, 0.0, 0.06, 0.02, 0.03, 0.01]),
        fcfMargin: annual([0.02, -0.01, 0.03, 0.0, 0.01]),
      },
    });
    expect(gradeBundle(durable).long.score).toBeGreaterThan(gradeBundle(weak).long.score + 25);
  });

  test('short and long horizons disagree when they should', () => {
    // Cheap, shrinking, low-quality: a plausible short-term bounce, a bad 20-year hold.
    const b = bundle({
      metric: {
        peTTM: 6,
        '52WeekPriceReturnDaily': 45,
        'priceRelativeToS&P50052Week': 30,
        revenueGrowthTTMYoy: 20,
        epsGrowthTTMYoy: 40,
      },
      series: {
        pe: annual([18, 20, 22, 19, 21]),
        roic: annual([0.02, 0.01, 0.03, -0.01, 0.02, 0.0, 0.01, 0.02, -0.02, 0.01]),
        operatingMargin: annual([0.03, 0.02, 0.04, 0.01, 0.02, 0.0, 0.03, 0.02, 0.01, 0.02]),
      },
    });
    const g = gradeBundle(b);
    expect(g.short.score).toBeGreaterThan(g.long.score + 20);
  });

  test('every factor carries weight on at least one horizon', () => {
    for (const f of FACTORS) {
      expect(f.weights.short + f.weights.long).toBeGreaterThan(0);
    }
  });

  test('horizon weights each sum to 100 so scores are comparable', () => {
    const short = FACTORS.reduce((a, f) => a + f.weights.short, 0);
    const long = FACTORS.reduce((a, f) => a + f.weights.long, 0);
    expect(short).toBe(100);
    expect(long).toBe(100);
  });

  test('verdict bands are stable and horizon-specific', () => {
    expect(verdictFor(85, 'long')).toBe('exceptional compounder');
    expect(verdictFor(85, 'short')).toBe('strong setup');
    expect(verdictFor(10, 'long')).toBe('avoid for a 20-year hold');
  });
});
