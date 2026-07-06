/**
 * RentCast — US rent estimates and property valuations.
 * Docs: https://developers.rentcast.io/
 * Activated when RENTCAST_API_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_FUNDAMENTALS } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'RentCast';
const BASE_URL = 'https://api.rentcast.io/v1';

function apiKey(): string {
  const k = process.env.RENTCAST_API_KEY;
  if (!k) throw new Error(`[${LABEL}] RENTCAST_API_KEY not set`);
  return k;
}

async function callRc(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const result = await callProvider({
    provider: 'rentcast', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs,
    headers: { 'X-Api-Key': apiKey() },
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: 'rentcast', title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: 'rentcast', asOf: result.asOf, cached: result.cached,
  });
}

const rentEstimate = new DynamicStructuredTool({
  name: 'rentcast_rent_estimate',
  description: 'Rent estimate (long-term average, low/high range) for a US address from RentCast.',
  schema: z.object({
    address: z.string().describe('Full US address'),
    bedrooms: z.number().int().optional(),
    bathrooms: z.number().optional(),
  }),
  func: async ({ address, bedrooms, bathrooms }) => {
    const params: Record<string, string> = { address };
    if (bedrooms !== undefined) params.bedrooms = String(bedrooms);
    if (bathrooms !== undefined) params.bathrooms = String(bathrooms);
    return callRc('/avm/rent/long-term', params, TTL_FUNDAMENTALS, `rent ${address.slice(0, 40)}`);
  },
});

const valueEstimate = new DynamicStructuredTool({
  name: 'rentcast_value_estimate',
  description: 'Property value estimate (AVM: price, low/high range, comparables) for a US address from RentCast.',
  schema: z.object({ address: z.string() }),
  func: async ({ address }) => callRc('/avm/value', { address }, TTL_FUNDAMENTALS, `value ${address.slice(0, 40)}`),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.RENTCAST_API_KEY) return null;
  return [rentEstimate, valueEstimate];
}