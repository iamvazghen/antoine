/**
 * Barrel + activation helper for the 15 roadmap finance providers.
 * Each provider file exports `getLeaves()`; this module iterates and yields
 * the union of activated leaves.
 */
import type { StructuredToolInterface } from '@langchain/core/tools';

import { getLeaves as alphaVantage } from './alpha-vantage.js';
import { getLeaves as polygon } from './polygon.js';
import { getLeaves as finnhub } from './finnhub.js';
import { getLeaves as fmp } from './fmp.js';
import { getLeaves as twelveData } from './twelve-data.js';
import { getLeaves as tiingo } from './tiingo.js';
import { getLeaves as eodhd } from './eodhd.js';
import { getLeaves as coingecko } from './coingecko.js';
import { getLeaves as coinmarketcap } from './coinmarketcap.js';
import { getLeaves as fred } from './fred.js';
import { getLeaves as rentcast } from './rentcast.js';
import { getLeaves as rapidapiRealtor } from './rapidapi-realtor.js';
import { getLeaves as ecb } from './ecb.js';
import { getLeaves as boe } from './boe.js';
import { getLeaves as bis } from './bis.js';
import { getLeaves as blockchain } from './blockchain.js';

const PROVIDERS: Array<{ name: string; leaves: StructuredToolInterface[] | null }> = [
  { name: 'Alpha Vantage', leaves: alphaVantage() },
  { name: 'Polygon', leaves: polygon() },
  { name: 'Finnhub', leaves: finnhub() },
  { name: 'FMP', leaves: fmp() },
  { name: 'Twelve Data', leaves: twelveData() },
  { name: 'Tiingo', leaves: tiingo() },
  { name: 'EODHD', leaves: eodhd() },
  { name: 'CoinGecko', leaves: coingecko() },
  { name: 'CoinMarketCap', leaves: coinmarketcap() },
  { name: 'FRED', leaves: fred() },
  { name: 'RentCast', leaves: rentcast() },
  { name: 'Realtor via RapidAPI', leaves: rapidapiRealtor() },
  // Free, no key required
  { name: 'ECB', leaves: ecb() },
  { name: 'Bank of England', leaves: boe() },
  { name: 'BIS', leaves: bis() },
  { name: 'Blockchain.com (on-chain)', leaves: blockchain() },
];

export function getAllProviderLeaves(): StructuredToolInterface[] {
  return PROVIDERS.flatMap((p) => p.leaves ?? []);
}

export function getActiveProviderNames(): string[] {
  return PROVIDERS.filter((p) => p.leaves && p.leaves.length > 0).map((p) => p.name);
}

export function getAllProviderNames(): string[] {
  return PROVIDERS.map((p) => p.name);
}