/**
 * Barrel for news providers. Each exports `getLeaves()` that returns the
 * StructuredToolInterface array when its env key is set, else null.
 */
import type { StructuredToolInterface } from '@langchain/core/tools';

import { getLeaves as newsapi } from './newsapi.js';
import { getLeaves as marketaux } from './marketaux.js';
import { getLeaves as benzinga } from './benzinga.js';
import { getNews } from './get-news.js';

const PROVIDERS: Array<{ name: string; leaves: StructuredToolInterface[] | null }> = [
  { name: 'NewsAPI', leaves: newsapi() },
  { name: 'Marketaux', leaves: marketaux() },
  { name: 'Benzinga', leaves: benzinga() },
];

export function getAllNewsLeaves(): StructuredToolInterface[] {
  return PROVIDERS.flatMap((p) => p.leaves ?? []);
}

export function getActiveNewsProviderNames(): string[] {
  return PROVIDERS.filter((p) => p.leaves && p.leaves.length > 0).map((p) => p.name);
}

export function getAllNewsProviderNames(): string[] {
  return PROVIDERS.map((p) => p.name);
}

/**
 * Meta-tool router that picks the best news source for a query. Only
 * registered when at least one news provider is configured.
 */
export function getNewsRouterTool(): StructuredToolInterface | null {
  const anyActive = PROVIDERS.some((p) => p.leaves && p.leaves.length > 0);
  return anyActive ? getNews : null;
}