/**
 * Shared utilities for financial tools.
 */

import { logger } from '../../utils/logger.js';

/** Sub-tool timeout in milliseconds. Returns partial results on timeout. */
export const SUB_TOOL_TIMEOUT_MS = 15_000;

/** Cache TTL constants. */
export const TTL_15M = 15 * 60 * 1000;
export const TTL_1H = 60 * 60 * 1000;
export const TTL_6H = 6 * 60 * 60 * 1000;
export const TTL_24H = 24 * 60 * 60 * 1000;

/**
 * Race a promise against a timeout. Rejects with a descriptive error
 * if the promise doesn't settle within `ms` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label ?? 'Operation'} timed out after ${ms / 1000}s`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Generic JSON-fetch helper used by every roadmap provider. Labels errors with
 * the provider name so chain fallbacks in meta-tools (e.g. news providers under
 * `get_market_data`) surface which one failed. Mirrors the helper that lived
 * inside `markets.ts` so behavior is identical for FX/World Bank.
 */
export async function fetchJson(
  url: string,
  label: string,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${label}] network error: ${message}`);
    throw new Error(`[${label}] request failed: ${message}`);
  }

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    logger.error(`[${label}] error: ${detail}`);
    throw new Error(`[${label}] request failed: ${detail}`);
  }

  return response.json().catch(() => {
    const detail = `invalid JSON (${response.status} ${response.statusText})`;
    logger.error(`[${label}] parse error: ${detail}`);
    throw new Error(`[${label}] request failed: ${detail}`);
  });
}

/**
 * Fetch a CSV endpoint and parse it into row objects keyed by the header line.
 * Deliberately minimal: the official statistics feeds that need this publish
 * plain comma-separated numbers with no quoting or embedded commas.
 */
export async function fetchCsvRows(
  url: string,
  label: string,
  init: RequestInit = {},
): Promise<Array<Record<string, string>>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Accept: 'text/csv', ...init.headers } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${label}] network error: ${message}`);
    throw new Error(`[${label}] request failed: ${message}`);
  }

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    logger.error(`[${label}] error: ${detail}`);
    throw new Error(`[${label}] request failed: ${detail}`);
  }

  const text = await response.text();
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}
