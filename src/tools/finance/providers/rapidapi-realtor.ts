/**
 * RapidAPI gateway — Realtor.com listings (default target).
 * Docs: https://rapidapi.com/apidojo/api/realtor
 * Activated when RAPIDAPI_KEY is set.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callProvider, TTL_FUNDAMENTALS } from '../provider-call.js';
import { formatToolResult, type SourceRef } from '../../types.js';

const LABEL = 'Realtor via RapidAPI';
const BASE_URL = 'https://realtor.p.rapidapi.com';

function apiKey(): string {
  const k = process.env.RAPIDAPI_KEY;
  if (!k) throw new Error(`[${LABEL}] RAPIDAPI_KEY not set`);
  return k;
}

async function callRapidApi(path: string, params: Record<string, string>, ttlMs: number, title?: string): Promise<string> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const result = await callProvider({
    provider: 'rapidapi_realtor', endpoint: path.slice(1).replace(/\//g, '_'),
    params, url: url.toString(), ttlMs,
    headers: {
      'X-RapidAPI-Key': apiKey(),
      'X-RapidAPI-Host': 'realtor.p.rapidapi.com',
    },
  });
  const sources: SourceRef[] = result.sourceUrls.map((u, i) => ({ id: i + 1, url: u, provider: 'rapidapi_realtor', title }));
  return JSON.stringify({
    data: result.data, sourceUrls: result.sourceUrls, sources,
    provider: 'rapidapi_realtor', asOf: result.asOf, cached: result.cached,
  });
}

const propertiesForSale = new DynamicStructuredTool({
  name: 'realtor_properties_for_sale',
  description: 'US properties for sale in a city from Realtor.com via RapidAPI.',
  schema: z.object({
    city: z.string().describe('City name, e.g. San Francisco'),
    state_code: z.string().describe('Two-letter US state, e.g. CA'),
    limit: z.number().int().min(1).max(200).default(20),
  }),
  func: async ({ city, state_code, limit }) =>
    callRapidApi('/properties/v2/list-for-sale', {
      city, state_code, limit: String(limit),
    }, TTL_FUNDAMENTALS, `${city}, ${state_code} for sale`),
});

export function getLeaves(): StructuredToolInterface[] | null {
  if (!process.env.RAPIDAPI_KEY) return null;
  return [propertiesForSale];
}