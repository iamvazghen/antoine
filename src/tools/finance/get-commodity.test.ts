import { _resolveCommodityForTest as resolveCommodity } from './get-commodity.js';

describe('commodity alias resolution', () => {
  test('resolves common aliases to canonical names', () => {
    expect(resolveCommodity('oil')).toBe('WTI');
    expect(resolveCommodity('crude')).toBe('WTI');
    expect(resolveCommodity('crude oil')).toBe('WTI');
    expect(resolveCommodity('brent')).toBe('BRENT');
    expect(resolveCommodity('brent crude')).toBe('BRENT');
    expect(resolveCommodity('gas')).toBe('NATURAL_GAS');
    expect(resolveCommodity('natural gas')).toBe('NATURAL_GAS');
    expect(resolveCommodity('ng')).toBe('NATURAL_GAS');
    expect(resolveCommodity('aluminium')).toBe('ALUMINUM');
    expect(resolveCommodity('commodities')).toBe('ALL_COMMODITIES');
  });

  test('passes canonical names through unchanged', () => {
    expect(resolveCommodity('WTI')).toBe('WTI');
    expect(resolveCommodity('BRENT')).toBe('BRENT');
    expect(resolveCommodity('COPPER')).toBe('COPPER');
    expect(resolveCommodity('ALL_COMMODITIES')).toBe('ALL_COMMODITIES');
  });

  test('uppercases and trims unknown names (lets them fall through to provider)', () => {
    expect(resolveCommodity('  weird_future  ')).toBe('WEIRD_FUTURE');
  });
});