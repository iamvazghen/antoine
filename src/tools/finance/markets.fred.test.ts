import { resolveFredSeries, fredObservationsUrl } from './markets.js';

/**
 * FRED used to expose nine series through a Zod enum, out of ~841,000. These
 * cover the two things that changed: a raw ID has to survive resolution, and
 * the cpi_yoy alias has to reach FRED's own transform rather than recomputing.
 */
describe('FRED series resolution', () => {
  test('an alias resolves to its series code and label', () => {
    const r = resolveFredSeries('fed_funds');
    expect(r.code).toBe('DFF');
    expect(r.label).toBe('Federal Funds Effective Rate');
    expect(r.alias).toBe('fed_funds');
  });

  test('a raw FRED ID passes through, upper-cased', () => {
    // The whole point of the change: this used to be rejected by the enum.
    const r = resolveFredSeries('IRLTLT01DEM156N');
    expect(r.code).toBe('IRLTLT01DEM156N');
    expect(r.alias).toBeUndefined();
  });

  test('an alias is matched case-insensitively', () => {
    expect(resolveFredSeries('Treasury_10Y').code).toBe('DGS10');
  });

  test('the credit-spread and mortgage aliases exist', () => {
    // Named in the tool description; a typo there would be invisible.
    expect(resolveFredSeries('hy_spread').code).toBe('BAMLH0A0HYM2');
    expect(resolveFredSeries('mortgage_30y').code).toBe('MORTGAGE30US');
    expect(resolveFredSeries('treasury_30y').code).toBe('DGS30');
  });
});

describe('FRED observation URL', () => {
  const url = (units?: string) =>
    fredObservationsUrl('CPIAUCSL', 'KEY', '2020-01-01', '2026-01-01', units);

  test('carries the series, window and key', () => {
    const u = url();
    expect(u.searchParams.get('series_id')).toBe('CPIAUCSL');
    expect(u.searchParams.get('observation_start')).toBe('2020-01-01');
    expect(u.searchParams.get('observation_end')).toBe('2026-01-01');
    expect(u.searchParams.get('file_type')).toBe('json');
  });

  test('a transform is passed to FRED, which computes it server-side', () => {
    expect(url('pc1').searchParams.get('units')).toBe('pc1');
  });

  test('the default transform is omitted rather than sent as lin', () => {
    expect(url('lin').searchParams.has('units')).toBe(false);
    expect(url().searchParams.has('units')).toBe(false);
  });
});
