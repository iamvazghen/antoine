import { describe, expect, test, afterEach } from 'bun:test';
import { resolveQuoteUnit, toUsd, clearFxCache } from './fx.js';

describe('fx', () => {
  afterEach(() => clearFxCache());

  test('sub-unit quote currencies resolve to their ISO parent', () => {
    expect(resolveQuoteUnit('GBp')).toEqual({ code: 'GBP', per: 100 });
    expect(resolveQuoteUnit('ZAc')).toEqual({ code: 'ZAR', per: 100 });
    expect(resolveQuoteUnit('GBP')).toEqual({ code: 'GBP', per: 1 });
    expect(resolveQuoteUnit('eur')).toEqual({ code: 'EUR', per: 1 });
  });

  test('USD is identity and needs no network call', async () => {
    expect(await toUsd(123.45, 'USD')).toBe(123.45);
  });

  test('non-finite amounts are rejected rather than converted', async () => {
    expect(await toUsd(Number.NaN, 'EUR')).toBeNull();
  });
});
