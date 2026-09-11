import { describe, test, expect } from 'bun:test';
import { toYahooSymbol, isYahooSupported, YAHOO_ONLY_EXCHANGES } from './yahoo.js';

describe('toYahooSymbol', () => {
  test('passes a bare US symbol through', () => {
    expect(toYahooSymbol('AAPL')).toBe('AAPL');
    expect(toYahooSymbol('aapl')).toBe('AAPL');
    expect(toYahooSymbol('BRK.B')).toBe('BRK.B'); // unknown suffix, left alone
  });

  test('maps the codes used elsewhere in the codebase', () => {
    // Every one of these was verified against the live API.
    expect(toYahooSymbol('VOD.LSE')).toBe('VOD.L');
    expect(toYahooSymbol('SAP.XETRA')).toBe('SAP.DE');
    expect(toYahooSymbol('PETR4.SA')).toBe('PETR4.SA');
    expect(toYahooSymbol('NPN.JSE')).toBe('NPN.JO');
    expect(toYahooSymbol('KER.WAR')).toBe('KER.WA');
    expect(toYahooSymbol('005930.KO')).toBe('005930.KS');
    expect(toYahooSymbol('BHP.AU')).toBe('BHP.AX');
    expect(toYahooSymbol('600519.SHG')).toBe('600519.SS');
    expect(toYahooSymbol('COMI.EGX')).toBe('COMI.CA');
  });

  test('reaches the markets no paid provider here covers', () => {
    expect(toYahooSymbol('7203.TSE')).toBe('7203.T');
    expect(toYahooSymbol('RELIANCE.NSE')).toBe('RELIANCE.NS');
    expect(toYahooSymbol('RELIANCE.BSE')).toBe('RELIANCE.BO');
    expect(toYahooSymbol('D05.SI')).toBe('D05.SI');
    expect(toYahooSymbol('TEVA.TA')).toBe('TEVA.TA');
    expect(toYahooSymbol('2222.SR')).toBe('2222.SR');
  });

  test('an unknown exchange is passed through, not guessed at', () => {
    // Guessing would silently query a different company; letting Yahoo report
    // no data is the safer failure.
    expect(toYahooSymbol('FOO.NOTREAL')).toBe('FOO.NOTREAL');
    expect(isYahooSupported('NOTREAL')).toBe(false);
  });

  test('splits on the LAST dot so class shares survive', () => {
    expect(toYahooSymbol('NOVO-B.CO')).toBe('NOVO-B.CO');
  });

  test('the Yahoo-only list is genuinely Yahoo-only', () => {
    for (const code of YAHOO_ONLY_EXCHANGES) {
      expect(isYahooSupported(code)).toBe(true);
    }
  });
});
