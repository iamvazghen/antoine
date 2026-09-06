/**
 * Region metadata for non-US tickers, keyed by EODHD exchange suffix.
 *
 * Generated from EODHD's own exchange list rather than written by hand, because
 * the hand-written version had four codes that simply do not exist — .AX, .KS,
 * .DE and .NSE all returned "Ticker Not Found" — and one that was actively
 * wrong: .SA was labelled Tadawul/Riyadh when EODHD uses it for Sao Paulo, so
 * a question about a Saudi stock answered with a Brazilian one priced in BRL.
 *
 * Correct codes for those: .AU (Australia), .KO / .KQ (Korea), .XETRA (plus the
 * German regionals .F .DU .MU .STU .HA .HM), and Brazil for .SA.
 *
 * Not reachable on this provider at all: Japan, India, Singapore, Israel,
 * Saudi Arabia, Turkey, Russia, and every Caucasus exchange (Georgia, Armenia,
 * Azerbaijan). For those, fall back to web_search or a US-listed ADR.
 *
 * Trading hours are recorded only where they are actually known; guessing
 * session times for 60 venues would put wrong numbers in front of the agent.
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
  /** Open time UTC, 24h format "HH:MM". Absent where the session times are not known. */
  openUtc?: string;
  /** Close time UTC. Absent where the session times are not known. */
  closeUtc?: string;
  /** Reporting unit (1 = raw, 1000 = thousands, 1000000 = millions). */
  unitScale: number;
}

// London and Johannesburg quote in the sub-unit — pence and cents — not pounds
// and rand. EODHD's own metadata says GBP/ZAR, which would overstate every
// price by 100x if taken at face value.
const REGIONS: Record<string, RegionMeta> = {
  AS: { exchange: 'AS', country: 'NL', currency: 'EUR', name: 'Euronext Amsterdam', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  AT: { exchange: 'AT', country: 'GR', currency: 'EUR', name: 'Athens Exchange', openUtc: '07:00', closeUtc: '15:20', unitScale: 1 },
  AU: { exchange: 'AU', country: 'AU', currency: 'AUD', name: 'Australian Securities Exchange', openUtc: '00:00', closeUtc: '06:00', unitScale: 1 },
  BA: { exchange: 'BA', country: 'AR', currency: 'ARS', name: 'Buenos Aires Exchange', unitScale: 1 },
  BC: { exchange: 'BC', country: 'MA', currency: 'MAD', name: 'Casablanca Stock Exchange', unitScale: 1 },
  BK: { exchange: 'BK', country: 'TH', currency: 'THB', name: 'Thailand Exchange', unitScale: 1 },
  BR: { exchange: 'BR', country: 'BE', currency: 'EUR', name: 'Euronext Brussels', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  BUD: { exchange: 'BUD', country: 'HU', currency: 'HUF', name: 'Budapest Stock Exchange', unitScale: 1 },
  CM: { exchange: 'CM', country: 'LK', currency: 'LKR', name: 'Colombo Stock Exchange', unitScale: 1 },
  CO: { exchange: 'CO', country: 'DK', currency: 'DKK', name: 'Copenhagen Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  DSE: { exchange: 'DSE', country: 'TZ', currency: 'TZS', name: 'Dar es Salaam Stock Exchange', unitScale: 1 },
  DU: { exchange: 'DU', country: 'DE', currency: 'EUR', name: 'Dusseldorf Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  EGX: { exchange: 'EGX', country: 'EG', currency: 'EGP', name: 'Egyptian Exchange', unitScale: 1 },
  F: { exchange: 'F', country: 'DE', currency: 'EUR', name: 'Frankfurt Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  GSE: { exchange: 'GSE', country: 'GH', currency: 'GHS', name: 'Ghana Stock Exchange', unitScale: 1 },
  HA: { exchange: 'HA', country: 'DE', currency: 'EUR', name: 'Hanover Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  HE: { exchange: 'HE', country: 'FI', currency: 'EUR', name: 'Helsinki Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  // Hong Kong is absent from EODHD's published exchange list but serves data
  // fine (0700.HK verified). The list is not authoritative for what works.
  HK: { exchange: 'HK', country: 'HK', currency: 'HKD', name: 'Hong Kong Exchange', openUtc: '01:30', closeUtc: '08:00', unitScale: 1 },
  HM: { exchange: 'HM', country: 'DE', currency: 'EUR', name: 'Hamburg Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  IR: { exchange: 'IR', country: 'IE', currency: 'EUR', name: 'Irish Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  JK: { exchange: 'JK', country: 'ID', currency: 'IDR', name: 'Jakarta Exchange', unitScale: 1 },
  JSE: { exchange: 'JSE', country: 'ZA', currency: 'ZAc', name: 'Johannesburg Exchange', openUtc: '07:00', closeUtc: '15:00', unitScale: 1 },
  KAR: { exchange: 'KAR', country: 'PK', currency: 'PKR', name: 'Karachi Stock Exchange', unitScale: 1 },
  KLSE: { exchange: 'KLSE', country: 'MY', currency: 'MYR', name: 'Kuala Lumpur Exchange', unitScale: 1 },
  KO: { exchange: 'KO', country: 'KR', currency: 'KRW', name: 'Korea Stock Exchange', openUtc: '00:00', closeUtc: '06:30', unitScale: 1 },
  KQ: { exchange: 'KQ', country: 'KR', currency: 'KRW', name: 'KOSDAQ', openUtc: '00:00', closeUtc: '06:30', unitScale: 1 },
  LIM: { exchange: 'LIM', country: 'PE', currency: 'PEN', name: 'Bolsa de Valores de Lima', unitScale: 1 },
  LS: { exchange: 'LS', country: 'PT', currency: 'EUR', name: 'Euronext Lisbon', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  LSE: { exchange: 'LSE', country: 'GB', currency: 'GBp', name: 'London Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  LU: { exchange: 'LU', country: 'LU', currency: 'EUR', name: 'Luxembourg Stock Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  LUSE: { exchange: 'LUSE', country: 'ZM', currency: 'ZMW', name: 'Lusaka Stock Exchange', unitScale: 1 },
  MC: { exchange: 'MC', country: 'ES', currency: 'EUR', name: 'Madrid Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  MSE: { exchange: 'MSE', country: 'MW', currency: 'MWK', name: 'Malawi Stock Exchange', unitScale: 1 },
  MU: { exchange: 'MU', country: 'DE', currency: 'EUR', name: 'Munich Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  MX: { exchange: 'MX', country: 'MX', currency: 'MXN', name: 'Mexican Exchange', openUtc: '14:30', closeUtc: '21:00', unitScale: 1 },
  NEO: { exchange: 'NEO', country: 'CA', currency: 'CAD', name: 'NEO Exchange', openUtc: '14:30', closeUtc: '21:00', unitScale: 1 },
  OL: { exchange: 'OL', country: 'NO', currency: 'NOK', name: 'Oslo Stock Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  PA: { exchange: 'PA', country: 'FR', currency: 'EUR', name: 'Euronext Paris', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  PR: { exchange: 'PR', country: 'CZ', currency: 'CZK', name: 'Prague Stock Exchange', unitScale: 1 },
  PSE: { exchange: 'PSE', country: 'PH', currency: 'PHP', name: 'Philippine Stock Exchange', unitScale: 1 },
  RO: { exchange: 'RO', country: 'RO', currency: 'RON', name: 'Bucharest Stock Exchange', unitScale: 1 },
  RSE: { exchange: 'RSE', country: 'RW', currency: 'RWF ', name: 'Rwanda Stock Exchange', unitScale: 1 },
  SA: { exchange: 'SA', country: 'BR', currency: 'BRL', name: 'Sao Paulo Exchange', openUtc: '13:00', closeUtc: '21:00', unitScale: 1 },
  SEM: { exchange: 'SEM', country: 'MU', currency: 'MUR', name: 'Stock Exchange of Mauritius', unitScale: 1 },
  SHE: { exchange: 'SHE', country: 'CN', currency: 'CNY', name: 'Shenzhen Stock Exchange', openUtc: '01:30', closeUtc: '07:00', unitScale: 1 },
  SHG: { exchange: 'SHG', country: 'CN', currency: 'CNY', name: 'Shanghai Stock Exchange', openUtc: '01:30', closeUtc: '07:00', unitScale: 1 },
  SN: { exchange: 'SN', country: 'CL', currency: 'CLP', name: 'Chilean Stock Exchange', unitScale: 1 },
  ST: { exchange: 'ST', country: 'SE', currency: 'SEK', name: 'Stockholm Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  STU: { exchange: 'STU', country: 'DE', currency: 'EUR', name: 'Stuttgart Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  SW: { exchange: 'SW', country: 'CH', currency: 'CHF', name: 'SIX Swiss Exchange', openUtc: '07:30', closeUtc: '16:30', unitScale: 1 },
  TO: { exchange: 'TO', country: 'CA', currency: 'CAD', name: 'Toronto Exchange', openUtc: '14:30', closeUtc: '21:00', unitScale: 1 },
  TW: { exchange: 'TW', country: 'TW', currency: 'TWD', name: 'Taiwan Stock Exchange', openUtc: '01:00', closeUtc: '05:30', unitScale: 1 },
  TWO: { exchange: 'TWO', country: 'TW', currency: 'TWD', name: 'Taiwan OTC Exchange', openUtc: '01:00', closeUtc: '05:30', unitScale: 1 },
  US: { exchange: 'US', country: 'US', currency: 'USD', name: 'USA Stocks', openUtc: '14:30', closeUtc: '21:00', unitScale: 1 },
  USE: { exchange: 'USE', country: 'UG', currency: 'UGX', name: 'Uganda Securities Exchange', unitScale: 1 },
  V: { exchange: 'V', country: 'CA', currency: 'CAD', name: 'TSX Venture Exchange', openUtc: '14:30', closeUtc: '21:00', unitScale: 1 },
  VFEX: { exchange: 'VFEX', country: 'ZW', currency: 'ZWL', name: 'Victoria Falls Stock Exchange', unitScale: 1 },
  VI: { exchange: 'VI', country: 'AT', currency: 'EUR', name: 'Vienna Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  VN: { exchange: 'VN', country: 'VN', currency: 'VND', name: 'Vietnam Stocks', unitScale: 1 },
  WAR: { exchange: 'WAR', country: 'PL', currency: 'PLN', name: 'Warsaw Stock Exchange', openUtc: '08:00', closeUtc: '15:50', unitScale: 1 },
  XBOT: { exchange: 'XBOT', country: 'BW', currency: 'BWP', name: 'Botswana Stock Exchange', unitScale: 1 },
  XETRA: { exchange: 'XETRA', country: 'DE', currency: 'EUR', name: 'XETRA Stock Exchange', openUtc: '08:00', closeUtc: '16:30', unitScale: 1 },
  XNAI: { exchange: 'XNAI', country: 'KE', currency: 'KES', name: 'Nairobi Securities Exchange', unitScale: 1 },
  XNSA: { exchange: 'XNSA', country: 'NG', currency: 'NGN', name: 'Nigerian Stock Exchange', unitScale: 1 },
  XZIM: { exchange: 'XZIM', country: 'ZW', currency: 'ZWL', name: 'Zimbabwe Stock Exchange', unitScale: 1 },
  ZSE: { exchange: 'ZSE', country: 'HR', currency: 'EUR', name: 'Zagreb Stock Exchange', unitScale: 1 },
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