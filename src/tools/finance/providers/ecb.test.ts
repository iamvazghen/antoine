import { describe, test, expect } from 'bun:test';
import { _ecbKnownSeriesForTest as KNOWN_SERIES } from './ecb.js';

describe('ECB known series', () => {
  test('maps rate names to series IDs', () => {
    expect(KNOWN_SERIES['ecb.deposit']).toMatch(/^FM\.B\.U2/);
    expect(KNOWN_SERIES['ecb.refi']).toMatch(/^FM\.B\.U2/);
    expect(KNOWN_SERIES['ecb.marginal']).toMatch(/^FM\.B\.U2/);
  });

  test('has eurozone HICP YoY', () => {
    expect(KNOWN_SERIES['ecb.hicp.yoy']).toMatch(/^ICP\.M\.U2/);
  });

  test('has major EUR FX pairs', () => {
    expect(KNOWN_SERIES['fx.eurusd']).toMatch(/^EXR\.D\.USD/);
    expect(KNOWN_SERIES['fx.eurgbp']).toMatch(/^EXR\.D\.GBP/);
    expect(KNOWN_SERIES['fx.eurjpy']).toMatch(/^EXR\.D\.JPY/);
  });
});