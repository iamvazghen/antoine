/**
 * Convert a series of numbers into a compact unicode sparkline.
 * Used by the watchlist sidebar and (optionally) the status bar's tokens chart.
 */
const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Returns a string of N characters (default 8) representing the input
 * series using 8 sparkline blocks. Rounds each value into one of 8 buckets
 * based on the min/max range. Empty/NaN series returns a placeholder dash.
 */
export function sparkline(values: ReadonlyArray<number>, width = 8): string {
  if (values.length === 0) return '—'.repeat(width);

  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return '·'.repeat(width);

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;

  // Down-sample or pad to `width`.
  const sampled: number[] = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * values.length);
    sampled.push(values[idx] ?? values[values.length - 1]);
  }

  return sampled
    .map((v) => {
      if (!Number.isFinite(v)) return '·';
      const norm = (v - min) / range;
      const bucket = Math.min(SPARKS.length - 1, Math.max(0, Math.floor(norm * SPARKS.length)));
      return SPARKS[bucket];
    })
    .join('');
}

/** Compute a percent change between first and last values (returns 0 if undefined). */
export function pctChange(values: ReadonlyArray<number>): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return 0;
  return ((last - first) / first) * 100;
}