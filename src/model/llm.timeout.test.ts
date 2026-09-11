import { describe, test, expect } from 'bun:test';
import { DEFAULT_LLM_TIMEOUT_MS } from './llm.js';
import { readFileSync } from 'node:fs';

/**
 * withLlmTimeout returns the promise untouched when no budget is given, and
 * nine of the ten callLlm callers never gave one — so a provider that accepted
 * the connection and then went silent hung the caller forever. read_filings
 * stalled the health sweep hard enough to need killing twice before this was
 * spotted, and the same hang reaches a Telegram turn.
 */
const source = readFileSync('src/model/llm.ts', 'utf-8');

describe('LLM call ceiling', () => {
  test('there is a default, and it is a sane one', () => {
    expect(DEFAULT_LLM_TIMEOUT_MS).toBeGreaterThan(30_000);
    expect(DEFAULT_LLM_TIMEOUT_MS).toBeLessThanOrEqual(300_000);
  });

  test('callLlm applies it rather than leaving the budget undefined', () => {
    // The bug was a destructure with no default: `timeoutMs` stayed undefined
    // and withLlmTimeout short-circuits on a falsy budget.
    expect(source).toContain('timeoutMs = DEFAULT_LLM_TIMEOUT_MS');
  });

  test('an unset budget still means no ceiling, so the default has to hold', () => {
    expect(source).toContain('if (!ms || ms <= 0) return promise;');
  });
});
