import {
  parseTicker,
  composeTicker,
  getRegion,
  getRegionByCountry,
  formatMarketCap,
} from './region-helpers.js';

describe('region-helpers', () => {
  test('parseTicker splits on the first dot', () => {
    expect(parseTicker('VOD.LSE')).toEqual({ symbol: 'VOD', exchange: 'LSE' });
    expect(parseTicker('7203.TSE')).toEqual({ symbol: '7203', exchange: 'TSE' });
    expect(parseTicker('RELIANCE.NSE')).toEqual({ symbol: 'RELIANCE', exchange: 'NSE' });
  });

  test('parseTicker treats no-dot input as US-style bare symbol', () => {
    expect(parseTicker('AAPL')).toEqual({ symbol: 'AAPL', exchange: null });
  });

  test('composeTicker round-trips through parseTicker', () => {
    const composed = composeTicker('sap', 'de');
    expect(parseTicker(composed)).toEqual({ symbol: 'SAP', exchange: 'DE' });
  });

  test('getRegion finds known exchanges', () => {
    const lse = getRegion('LSE');
    expect(lse?.currency).toBe('GBp');
    expect(lse?.country).toBe('GB');
    const tse = getRegion('TSE');
    expect(tse?.currency).toBe('JPY');
    expect(tse?.country).toBe('JP');
  });

  test('getRegion returns null for unknown exchanges', () => {
    expect(getRegion('XYZ')).toBeNull();
  });

  test('getRegionByCountry returns the first matching region', () => {
    const us = getRegionByCountry('us');
    expect(us?.currency).toBe('USD');
    const cn = getRegionByCountry('CN');
    // China has both SHG and SHE; either is acceptable.
    expect(['CNY', 'CNY']).toContain(cn?.currency);
  });

  test('formatMarketCap scales with magnitude and tags currency', () => {
    const lse = getRegion('LSE');
    expect(formatMarketCap(150_000_000_000, lse)).toMatch(/^150\.0B\s+GBp$/);
    const tse = getRegion('TSE');
    expect(formatMarketCap(2_500_000_000_000, tse)).toMatch(/^2\.5T\s+JPY$/);
  });

  test('formatMarketCap returns raw number when region is null', () => {
    expect(formatMarketCap(42, null)).toBe('42');
  });
});