/**
 * FRED — US Federal Reserve Economic Data (St. Louis Fed).
 * Docs: https://fred.stlouisfed.org/docs/api/fred/
 * Activated when FRED_API_KEY is set.
 *
 * Ponytail: thin re-export of the rich FRED tool already wired into
 * markets.ts, exposed under the provider name so the registry can route it.
 */
import type { StructuredToolInterface } from '@langchain/core/tools';
import { getFredSeries } from '../markets.js';

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.FRED_API_KEY) return null;
  return [getFredSeries];
}