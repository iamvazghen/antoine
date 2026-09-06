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

const ANTOINE_DIR = resolveAntoineDir();

export function getAntoineDir(): string {
  return ANTOINE_DIR;
}

export function antoinePath(...segments: string[]): string {
  return join(ANTOINE_DIR, ...segments);
}
