/**
 * Composite grading and the score ledger.
 *
 * The ledger is the point. A grade that only ever appears in a chat reply is an
 * opinion; a grade appended to `<antoine>/scores/<TICKER>.jsonl` with the price
 * at the time is a track record. Every later run can then say what changed and,
 * once enough time has passed, whether the high grades actually did better.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { antoinePath } from '../utils/paths.js';
import { fetchBundle, latestPrice, type TickerBundle } from './data.js';
import { FACTORS, type Horizon } from './factors.js';

export interface FactorScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HorizonGrade {
  horizon: Horizon;
  score: number;
  verdict: string;
  /** Share of the horizon's total weight that had usable data, 0-100. */
  coverage: number;
  factors: FactorScore[];
  missing: string[];
}

export interface Grade {
  ticker: string;
  asOf: string;
  price: number | null;
  short: HorizonGrade;
  long: HorizonGrade;
  sources: string[];
  dataGaps: string[];
}

/** Bands are fixed so that "71" means the same thing in every report. */
export function verdictFor(score: number, horizon: Horizon): string {
  const long = horizon === 'long';
  if (score >= 80) return long ? 'exceptional compounder' : 'strong setup';
  if (score >= 65) return long ? 'high-quality holding' : 'favourable';
  if (score >= 50) return long ? 'acceptable, not special' : 'mixed';
  if (score >= 35) return long ? 'structurally weak' : 'unfavourable';
  return long ? 'avoid for a 20-year hold' : 'avoid';
}

function gradeHorizon(b: TickerBundle, horizon: Horizon): HorizonGrade {
  const factors: FactorScore[] = [];
  const missing: string[] = [];
  let weighted = 0;
  let usedWeight = 0;
  let totalWeight = 0;

  for (const f of FACTORS) {
    const weight = f.weights[horizon];
    if (weight <= 0) continue;
    totalWeight += weight;

    const score = f.score(b);
    if (score === null) {
      missing.push(f.label);
      continue;
    }

    weighted += score * weight;
    usedWeight += weight;
    factors.push({ id: f.id, label: f.label, score, weight, detail: f.detail(b) });
  }

  // Renormalise over the factors that scored: a missing input must not read as
  // a zero, or a data gap would masquerade as a bad company.
  const score = usedWeight > 0 ? weighted / usedWeight : 0;
  const coverage = totalWeight > 0 ? (usedWeight / totalWeight) * 100 : 0;

  return {
    horizon,
    score: Math.round(score),
    verdict: verdictFor(score, horizon),
    coverage: Math.round(coverage),
    factors: factors.sort((a, b2) => b2.weight * b2.score - a.weight * a.score),
    missing,
  };
}

export function gradeBundle(b: TickerBundle): Grade {
  return {
    ticker: b.ticker,
    asOf: b.asOf,
    price: latestPrice(b),
    short: gradeHorizon(b, 'short'),
    long: gradeHorizon(b, 'long'),
    sources: b.sources,
    dataGaps: b.missing,
  };
}

export async function gradeTicker(ticker: string): Promise<Grade> {
  return gradeBundle(await fetchBundle(ticker));
}

// ------------------------------------------------------------------ ledger

export interface ScoreRecord {
  ticker: string;
  at: string;
  short: number;
  long: number;
  shortCoverage: number;
  longCoverage: number;
  /** Close at grade time. Null when the price provider was unreachable. */
  price: number | null;
}

function scoresDir(): string {
  const dir = antoinePath('scores');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function ledgerPath(ticker: string): string {
  return `${scoresDir()}/${ticker.toUpperCase()}.jsonl`;
}

export function recordScore(g: Grade): ScoreRecord {
  const record: ScoreRecord = {
    ticker: g.ticker,
    at: g.asOf,
    short: g.short.score,
    long: g.long.score,
    shortCoverage: g.short.coverage,
    longCoverage: g.long.coverage,
    price: g.price,
  };
  appendFileSync(ledgerPath(g.ticker), `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
}

export function readLedger(ticker: string): ScoreRecord[] {
  const path = ledgerPath(ticker);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ScoreRecord];
      } catch {
        return [];
      }
    });
}

export function readAllLedgers(): ScoreRecord[] {
  const dir = scoresDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => readLedger(f.replace(/\.jsonl$/, '')));
}

/** The previous grade for a ticker, so a report can show the move, not just the level. */
export function previousScore(ticker: string, beforeIso?: string): ScoreRecord | null {
  const records = readLedger(ticker);
  const cutoff = beforeIso ? Date.parse(beforeIso) : Date.now();
  const earlier = records.filter((r) => Date.parse(r.at) < cutoff);
  return earlier.length > 0 ? earlier[earlier.length - 1] : null;
}

// -------------------------------------------------------------- calibration

export interface CalibrationBucket {
  band: string;
  observations: number;
  meanForwardReturn: number;
  medianHoldDays: number;
}

/**
 * Did the high grades actually do better? Pairs every ledger entry that has a
 * price with the latest price for the same ticker and buckets the forward
 * return by the grade at the time. Needs real elapsed time to say anything —
 * with a few weeks of history it reports what it has and nothing more.
 */
export function calibration(horizon: Horizon, minDays = 30): CalibrationBucket[] {
  const byTicker = new Map<string, ScoreRecord[]>();
  for (const r of readAllLedgers()) {
    if (r.price === null) continue;
    const list = byTicker.get(r.ticker) ?? [];
    list.push(r);
    byTicker.set(r.ticker, list);
  }

  const bands = [
    { band: '80-100', lo: 80, hi: 101 },
    { band: '65-79', lo: 65, hi: 80 },
    { band: '50-64', lo: 50, hi: 65 },
    { band: '35-49', lo: 35, hi: 50 },
    { band: '0-34', lo: 0, hi: 35 },
  ];
  const buckets = bands.map((b) => ({ ...b, returns: [] as number[], holds: [] as number[] }));

  for (const records of byTicker.values()) {
    const sorted = [...records].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const last = sorted[sorted.length - 1];
    if (last.price === null) continue;

    for (const r of sorted.slice(0, -1)) {
      if (r.price === null || r.price <= 0) continue;
      const days = (Date.parse(last.at) - Date.parse(r.at)) / 86_400_000;
      if (days < minDays) continue;

      const score = horizon === 'short' ? r.short : r.long;
      const bucket = buckets.find((b) => score >= b.lo && score < b.hi);
      if (!bucket) continue;
      bucket.returns.push(((last.price - r.price) / r.price) * 100);
      bucket.holds.push(days);
    }
  }

  return buckets
    .filter((b) => b.returns.length > 0)
    .map((b) => ({
      band: b.band,
      observations: b.returns.length,
      meanForwardReturn: b.returns.reduce((a, x) => a + x, 0) / b.returns.length,
      medianHoldDays: [...b.holds].sort((a, x) => a - x)[Math.floor(b.holds.length / 2)],
    }));
}
