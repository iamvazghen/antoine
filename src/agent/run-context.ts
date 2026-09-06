import { Scratchpad } from './scratchpad.js';
import { TokenCounter } from './token-counter.js';

/**
 * Mutable state for a single agent run.
 */
export interface RunContext {
  readonly query: string;
  readonly scratchpad: Scratchpad;
  readonly tokenCounter: TokenCounter;
  readonly startTime: number;
  iteration: number;
  /**
   * Input token count from the most recent API response.
   * This is the actual context size reported by the API — far more accurate
   * than character-based estimation. Used by manageContextThreshold() to
   * anchor token estimates on real data.
   */
  lastApiInputTokens: number;
  /**
   * Reasoning produced this turn by a thinking model, kept so the final
   * done event can carry it to surfaces that render after the fact (the
   * Telegram gateway) rather than live (the TUI).
   */
  reasoning: string;
}

export function createRunContext(query: string): RunContext {
  return {
    query,
    scratchpad: new Scratchpad(query),
    tokenCounter: new TokenCounter(),
    startTime: Date.now(),
    iteration: 0,
    lastApiInputTokens: 0,
    reasoning: '',
  };
}
