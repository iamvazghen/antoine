/**
 * Currency normalisation to USD for the region-aware finance tools.
 *
 * Non-US quotes come back in the local unit — and for London and Johannesburg
 * in the *sub*-unit — so a raw comparison across regions is meaningless. This
 * converts to USD using the same free Frankfurter (ECB) endpoint the
 * get_fx_rates tool already uses. No key, no new dependency.
 */
import { fetchJson } from './utils.js';

/**
 * Quote units that are one hundredth of their ISO currency. The region table
 * records these deliberately (GBp, ZAc) — treating them as GBP/ZAR overstates
 * every price by 100x.
 */
const SUBUNITS: Record<string, { code: string; per: number }> = {
  GBP: { code: 'GBP', per: 100 },
  ZAC: { code: 'ZAR', per: 100 },
  ILA: { code: 'ILS', per: 100 },
};

/** Split a quote unit into its ISO currency and how many of it make one unit. */
export function resolveQuoteUnit(currency: string): { code: string; per: number } {
  const raw = currency.trim();
  // Only the lowercase-subunit spellings (GBp, ZAc, ILa) are sub-units; plain
  // GBP is pounds.
  if (raw.length === 3 && raw[2] === raw[2].toLowerCase() && raw[2] !== raw[2].toUpperCase()) {
    const hit = SUBUNITS[raw.toUpperCase()];
    if (hit) return hit;
  }
  return { code: raw.toUpperCase(), per: 1 };
}

// ponytail: module-level map, 12h TTL. ECB publishes once a working day, so a
// shared TTL cache is enough; move it to the disk cache if a second caller
// needs it across processes.
const RATE_TTL_MS = 12 * 60 * 60 * 1000;
const rateCache = new Map<string, { rate: number; at: number }>();

/** USD value of one unit of `code`. Returns null when the rate is unavailable. */
export async function usdRate(code: string): Promise<number | null> {
  const upper = code.toUpperCase();
  if (upper === 'USD') return 1;

  const hit = rateCache.get(upper);
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.rate;

  try {
    const data = (await fetchJson(
      `https://api.frankfurter.app/latest?base=${upper}&symbols=USD`,
      'Frankfurter FX',
    )) as { rates?: Record<string, number> };
    const rate = data.rates?.USD;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
    rateCache.set(upper, { rate, at: Date.now() });
    return rate;
  } catch {
    // A missing FX rate must not fail the whole quote — the local-currency
    // figure is still correct and is what the caller already had.
    return null;
  }
}

/**
 * Convert an amount quoted in `currency` (ISO code or sub-unit like "GBp")
 * into USD. Returns null when the rate is unavailable.
 */
export async function toUsd(amount: number, currency: string): Promise<number | null> {
  if (!Number.isFinite(amount)) return null;
  const { code, per } = resolveQuoteUnit(currency);
  const rate = await usdRate(code);
  return rate === null ? null : (amount / per) * rate;
}

/** Reset the rate cache. Tests only. */
export function clearFxCache(): void {
  rateCache.clear();
}
