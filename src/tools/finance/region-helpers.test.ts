import {
  parseTicker,
  composeTicker,
  getRegion,
  getRegionByCountry,
  formatMarketCap,
  listSupportedExchanges,
} from './region-helpers.js';

describe('region-helpers', () => {
  test('parseTicker splits on the first dot', () => {
    expect(parseTicker('VOD.LSE')).toEqual({ symbol: 'VOD', exchange: 'LSE' });
    expect(parseTicker('PETR4.SA')).toEqual({ symbol: 'PETR4', exchange: 'SA' });
    expect(parseTicker('005930.KO')).toEqual({ symbol: '005930', exchange: 'KO' });
  });

  test('parseTicker treats no-dot input as US-style bare symbol', () => {
    expect(parseTicker('AAPL')).toEqual({ symbol: 'AAPL', exchange: null });
  });

  test('composeTicker round-trips through parseTicker', () => {
    const composed = composeTicker('sap', 'xetra');
    expect(parseTicker(composed)).toEqual({ symbol: 'SAP', exchange: 'XETRA' });
  });

  test('getRegion finds known exchanges', () => {
    const lse = getRegion('LSE');
    expect(lse?.currency).toBe('GBp');
    expect(lse?.country).toBe('GB');
  });

  test('getRegion returns null for unknown exchanges', () => {
    expect(getRegion('XYZ')).toBeNull();
  });

  // The table used to claim .SA was Tadawul in Riyadh. EODHD uses .SA for Sao
  // Paulo, so every Saudi question was answered with a Brazilian stock priced in
  // the wrong currency. This is the regression guard for that.
  test('SA is Sao Paulo, not Riyadh', () => {
    const sa = getRegion('SA');
    expect(sa?.country).toBe('BR');
    expect(sa?.currency).toBe('BRL');
  });

  // These four were in the table but return "Ticker Not Found" from the provider.
  test('exchange codes that the provider does not accept are absent', () => {
    for (const dead of ['AX', 'KS', 'DE', 'NSE', 'BSE', 'TSE', 'SI']) {
      expect(getRegion(dead)).toBeNull();
    }
  });

  test('the regions the coverage claim rests on are present', () => {
    for (const [code, country] of [
      ['SA', 'BR'], ['BA', 'AR'], ['SN', 'CL'], ['LIM', 'PE'], // South America
      ['JSE', 'ZA'], ['EGX', 'EG'], ['XNSA', 'NG'], ['BC', 'MA'], // Africa
      ['AU', 'AU'], ['KO', 'KR'], ['HK', 'HK'], ['BK', 'TH'], ['JK', 'ID'], // Asia-Pacific
      ['XETRA', 'DE'], ['WAR', 'PL'], ['BUD', 'HU'], ['PR', 'CZ'], // Europe
    ] as Array<[string, string]>) {
      expect(getRegion(code)?.country).toBe(country);
    }
  });

  test('sub-unit quoting is recorded where the provider uses it', () => {
    // Both venues quote in cents/pence; taking the provider's own GBP/ZAR at
    // face value would overstate every price by 100x.
    expect(getRegion('LSE')?.currency).toBe('GBp');
    expect(getRegion('JSE')?.currency).toBe('ZAc');
  });

  test('getRegionByCountry returns the first matching region', () => {
    const us = getRegionByCountry('us');
    expect(us?.currency).toBe('USD');
    expect(getRegionByCountry('CN')?.currency).toBe('CNY');
  });

  test('coverage is broad enough to be worth the lookup', () => {
    expect(listSupportedExchanges().length).toBeGreaterThan(50);
  });

  test('formatMarketCap scales with magnitude and tags currency', () => {
    expect(formatMarketCap(150_000_000_000, getRegion('LSE'))).toMatch(/^150\.0B\s+GBp$/);
    expect(formatMarketCap(2_500_000_000_000, getRegion('SA'))).toMatch(/^2\.5T\s+BRL$/);
  });

  test('formatMarketCap returns raw number when region is null', () => {
    expect(formatMarketCap(42, null)).toBe('42');
  });
});
