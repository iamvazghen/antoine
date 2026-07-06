/**
 * Bank of England — official bank rate + inflation.
 * Free statistical database: https://www.bankofengland.co.uk/boe-database/database-tables
 *
 * Specific CSV endpoints we use:
 *   IUDBEDR — Bank Rate (official policy rate)
 *   LPMVWYR — 12-month CPI inflation
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_INTRADAY_QUOTE, TTL_FUNDAMENTALS } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'Bank of England';
// BoE publishes CSV downloads from their interactive database. We use a JSON
// proxy via the BoE statistics API (free, no key).
const BASE_URL = 'https://www.bankofengland.co.uk/boe-database';

async function callBoe(series: string, ttlMs: number, title?: string): Promise<string> {
  // The BoE exposes a JSON endpoint at /-/media/... but the most reliable
  // public-facing format is the CSV download. We use the ONS-compatible
  // series-code convention.
  const url = `${BASE_URL}/time-series/${series}/CSV`;
  const result = await callProvider({
    provider: 'boe', endpoint: series.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    params: { series },
    url, ttlMs,
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: 'boe', title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: 'boe', asOf: result.asOf, cached: result.cached,
  });
}

const bankRate = new DynamicStructuredTool({
  name: 'boe_bank_rate',
  description: 'Bank of England official Bank Rate (UK policy rate) time series. Free, no key.',
  schema: z.object({}),
  func: async () => callBoe('IUDBEDR', TTL_INTRADAY_QUOTE, 'BoE Bank Rate'),
});

const cpi = new DynamicStructuredTool({
  name: 'boe_cpi',
  description: 'UK CPI inflation (12-month % change) time series. Free, no key.',
  schema: z.object({}),
  func: async () => callBoe('LPMVWYR', TTL_FUNDAMENTALS, 'UK CPI 12m'),
});

export function getLeaves(): StructuredToolInterface[] | null {
  return [bankRate, cpi];
}

export const boeBankRate = bankRate;
export const boeCpi = cpi;