import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Absolute home for every piece of Antoine state: memory, cron jobs, portfolio,
 * scores, reports.
 *
 * This used to be the bare relative string '.antoine', which meant the process
 * read a *different* brain depending on the directory it was launched from — a
 * scheduled run started anywhere but the repo root silently got empty memory,
 * no portfolio and no cron jobs. Resolved once, at module load, to an absolute
 * path.
 *
 * Order: $ANTOINE_HOME > ./.antoine if it already exists (back-compat for an
 * existing checkout) > ~/.antoine.
 */
function resolveAntoineDir(): string {
  const fromEnv = process.env.ANTOINE_HOME?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(fromEnv);
  }

  const local = resolve('.antoine');
  if (existsSync(local)) {
    return local;
  }

  return join(homedir(), '.antoine');
}

/**
 * Memoised against the value of $ANTOINE_HOME rather than resolved once and
 * frozen.
 *
 * Freezing at module load meant a process that set ANTOINE_HOME after the module
 * graph had loaded was silently ignored - so a test that pointed state at a
 * scratch directory still read and wrote the real portfolio, memory and score
 * ledger, depending purely on which file imported first. Three separate suites
 * hit that before it was traced here.
 *
 * Still resolved to an absolute path, which is what the original note was really
 * protecting: a relative '.antoine' meant a scheduled run started outside the
 * repo root read an empty brain.
 */
let cached: { key: string; dir: string } | null = null;

export function getAntoineDir(): string {
  const key = process.env.ANTOINE_HOME?.trim() ?? '';
  if (!cached || cached.key !== key) {
    cached = { key, dir: resolveAntoineDir() };
  }
  return cached.dir;
}

export function antoinePath(...segments: string[]): string {
  return join(getAntoineDir(), ...segments);
}
