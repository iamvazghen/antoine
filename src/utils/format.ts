/**
 * Wall-clock duration for the working indicator:
 *   < 60s → "22s"
 *   ≥ 60s → "4m 6s"
 */
export function formatTurnDuration(ms: number): string {
  if (ms < 60_000) {
    return `${Math.floor(ms / 1000)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

const compactFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

/**
 * Compact number with k/m suffix, lowercase.
 *   880 → "880", 3200 → "3.2k", 14000 → "14k", 1500000 → "1.5m"
 */
export function formatTokensCompact(n: number): string {
  return compactFormatter.format(n).toLowerCase();
}

/**
 * Current date, formatted for prompts.
 *
 * Lives in this leaf util rather than agent/prompts.ts on purpose: five tool
 * files need only this one pure helper, and importing it from prompts.ts made
 * every one of them part of a prompts → registry → tool → prompts cycle.
 */
export function getCurrentDate(): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date().toLocaleDateString('en-US', options);
}
