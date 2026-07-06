/**
 * Region-aware helpers for non-US tickers. The roadmap providers (EODHD,
 * Tiingo, Twelve Data, Polygon) accept different ticker formats:
 *   - US:      AAPL, NVDA, MSFT (bare, no suffix)
 *   - LSE:     VOD.LSE, BP.LSE
 *   - Euronext: AIR.PA (Paris), ASML.AS (Amsterdam)
 *   - Xetra:   SAP.DE, BMW.DE
 *   - Swiss:   NESN.SW
 *   - Tokyo:   7203.TSE
 *   - Hong Kong: 0700.HK
 *   - Shanghai: 600519.SHG (EODHD notation)
 *   - Shenzhen: 000001.SHE
 *   - NSE:     RELIANCE.NSE
 *   - BSE:     RELIANCE.BSE
 *   - ASX:     BHP.AX
 *   - TSX:     SHOP.TO
 *   - TSX-V:   .V (venture)
 *   - KRX:     005930.KS (Samsung)
 *   - SGX:     D05.SI
 *
 * Ponytail: just a lookup table + helpers — the actual EODHD endpoint is
 * already wired in `eodhd.ts`. This module adds the *region semantics*
 * (currency, trading hours, market cap unit) that the agent needs to
 * reason about non-US holdings.
 */

export interface RegionMeta {
  /** EODHD exchange suffix. */
  exchange: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  /** ISO 4217 currency code. */
  currency: string;
  /** Display name (English). */
  name: string;
  /** Open time UTC, 24h format "HH:MM". */
  openUtc: string;
  /** Close time UTC. */
  closeUtc: string;
  /** Reporting unit (1 = raw, 1000 = thousands, 1000000 = millions). */
  unitScale: number;
}

const REGIONS: Record<string, RegionMeta> = {
  US: { exchange: 'US', country: 'US', currency: 'USD', name: 'United States', openUtc: '14:30', closeUtc: '21:00', unitScale: 1 },
  LSE: { exchange: 'LSE', country: 'GB', currency: 'GBp', name: 'London', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 }, // GBp = pence
  PA: { exchange: 'PA', country: 'FR', currency: 'EUR', name: 'Euronext Paris', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  AS: { exchange: 'AS', country: 'NL', currency: 'EUR', name: 'Euronext Amsterdam', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  BE: { exchange: 'BE', country: 'BE', currency: 'EUR', name: 'Euronext Brussels', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  DE: { exchange: 'DE', country: 'DE', currency: 'EUR', name: 'Xetra (Frankfurt)', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  SW: { exchange: 'SW', country: 'CH', currency: 'CHF', name: 'SIX Swiss', openUtc: '07:30', closeUtc: '16:30', unitScale: 1 },
  MC: { exchange: 'MC', country: 'ES', currency: 'EUR', name: 'BME (Madrid)', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  MI: { exchange: 'MI', country: 'IT', currency: 'EUR', name: 'Borsa Italiana', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  ST: { exchange: 'ST', country: 'SE', currency: 'SEK', name: 'Nasdaq Stockholm', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  CO: { exchange: 'CO', country: 'DK', currency: 'DKK', name: 'Nasdaq Copenhagen', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  OL: { exchange: 'OL', country: 'NO', currency: 'NOK', name: 'Oslo Børs', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  HE: { exchange: 'HE', country: 'FI', currency: 'EUR', name: 'Nasdaq Helsinki', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  VI: { exchange: 'VI', country: 'AT', currency: 'EUR', name: 'Vienna', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  LS: { exchange: 'LS', country: 'PT', currency: 'EUR', name: 'Euronext Lisbon', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  IR: { exchange: 'IR', country: 'IE', currency: 'EUR', name: 'Euronext Dublin', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  TSE: { exchange: 'TSE', country: 'JP', currency: 'JPY', name: 'Tokyo', openUtc: '00:00', closeUtc: '06:00', unitScale: 1 },
  HK: { exchange: 'HK', country: 'HK', currency: 'HKD', name: 'Hong Kong', openUtc: '01:30', closeUtc: '08:00', unitScale: 1 },
  SHG: { exchange: 'SHG', country: 'CN', currency: 'CNY', name: 'Shanghai', openUtc: '01:30', closeUtc: '07:00', unitScale: 1 },
  SHE: { exchange: 'SHE', country: 'CN', currency: 'CNY', name: 'Shenzhen', openUtc: '01:30', closeUtc: '07:00', unitScale: 1 },
  NSE: { exchange: 'NSE', country: 'IN', currency: 'INR', name: 'NSE India', openUtc: '03:45', closeUtc: '10:00', unitScale: 1 },
  BSE: { exchange: 'BSE', country: 'IN', currency: 'INR', name: 'BSE India', openUtc: '03:45', closeUtc: '10:00', unitScale: 1 },
  AX: { exchange: 'AX', country: 'AU', currency: 'AUD', name: 'ASX (Sydney)', openUtc: '00:00', closeUtc: '06:00', unitScale: 1 },
  NZ: { exchange: 'NZ', country: 'NZ', currency: 'NZD', name: 'NZX (Wellington)', openUtc: '00:00', closeUtc: '05:00', unitScale: 1 },
  TO: { exchange: 'TO', country: 'CA', currency: 'CAD', name: 'TSX (Toronto)', openUtc: '14:00', closeUtc: '21:00', unitScale: 1 },
  V: { exchange: 'V', country: 'CA', currency: 'CAD', name: 'TSX Venture', openUtc: '14:00', closeUtc: '21:00', unitScale: 1 },
  KS: { exchange: 'KS', country: 'KR', currency: 'KRW', name: 'KRX (Seoul)', openUtc: '00:00', closeUtc: '06:30', unitScale: 1 },
  SI: { exchange: 'SI', country: 'SG', currency: 'SGD', name: 'SGX (Singapore)', openUtc: '01:00', closeUtc: '09:00', unitScale: 1 },
  TW: { exchange: 'TW', country: 'TW', currency: 'TWD', name: 'TWSE (Taipei)', openUtc: '01:00', closeUtc: '05:30', unitScale: 1 },
  T: { exchange: 'T', country: 'IL', currency: 'ILS', name: 'TASE (Tel Aviv)', openUtc: '08:00', closeUtc: '15:30', unitScale: 1 },
  SA: { exchange: 'SA', country: 'SA', currency: 'SAR', name: 'Tadawul (Riyadh)', openUtc: '07:00', closeUtc: '11:30', unitScale: 1 },
};

/** Look up region metadata by EODHD exchange suffix. */
export function getRegion(exchange: string): RegionMeta | null {
  return REGIONS[exchange.toUpperCase()] ?? null;
}

/** Look up region metadata by country code. */
export function getRegionByCountry(countryCode: string): RegionMeta | null {
  const upper = countryCode.toUpperCase();
  for (const meta of Object.values(REGIONS)) {
    if (meta.country === upper) return meta;
  }
  return null;
}

/** Split a ticker into bare symbol + exchange suffix. */
export function parseTicker(ticker: string): { symbol: string; exchange: string | null } {
  const idx = ticker.indexOf('.');
  if (idx === -1) return { symbol: ticker.toUpperCase(), exchange: null };
  return { symbol: ticker.slice(0, idx).toUpperCase(), exchange: ticker.slice(idx + 1).toUpperCase() };
}

/** Compose a fully qualified EODHD ticker from symbol + exchange. */
export function composeTicker(symbol: string, exchange: string): string {
  return `${symbol.toUpperCase()}.${exchange.toUpperCase()}`;
}

/** List every supported exchange (for /providers display). */
export function listSupportedExchanges(): RegionMeta[] {
  return Object.values(REGIONS);
}

/**
 * Format a market-cap number in a region's reporting unit.
 * EODHD reports market cap in the local currency but at scale 1 (raw).
 * This helper just appends the currency unit.
 */
export function formatMarketCap(value: number, region: RegionMeta | null): string {
  if (!region) return value.toString();
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T ${region.currency}`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B ${region.currency}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M ${region.currency}`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K ${region.currency}`;
  return `${value} ${region.currency}`;
}