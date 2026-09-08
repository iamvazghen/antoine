import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAntoineDir, antoinePath } from '../utils/paths.js';

/**
 * State-writing modules must follow ANTOINE_HOME, not a copy of it taken at
 * import time.
 *
 * The behavioural suite wrote a real position into the real portfolio twice
 * before this was pinned down. The first cause was a path frozen at module load;
 * the second was subtler — ES `import` statements are hoisted and evaluated
 * before any top-level code, so setting ANTOINE_HOME at the top of a file still
 * runs *after* every module it imports has already chosen a directory.
 *
 * A test that only checks its own scratch directory cannot catch either, because
 * the damage lands somewhere else entirely.
 */
const SCRATCH = mkdtempSync(join(tmpdir(), 'antoine-isolation-'));

afterAll(() => {
  delete process.env.ANTOINE_HOME;
  try {
    rmSync(SCRATCH, { recursive: true, force: true });
  } catch {
    // Windows may still hold a handle; the OS reaps the temp directory anyway.
  }
});

describe('state directory isolation', () => {
  test('antoinePath follows a change to ANTOINE_HOME', () => {
    const before = getAntoineDir();
    process.env.ANTOINE_HOME = SCRATCH;
    expect(getAntoineDir()).toBe(SCRATCH);
    expect(antoinePath('cache')).toBe(join(SCRATCH, 'cache'));
    expect(getAntoineDir()).not.toBe(before);
  });

  test('the portfolio store writes wherever ANTOINE_HOME points now', async () => {
    process.env.ANTOINE_HOME = SCRATCH;
    const { PortfolioStore } = await import('../tools/portfolio/store.js');

    // A store built before the change must still honour the change: the tools
    // module constructs exactly one at import time.
    const store = new PortfolioStore();
    store.update((p) => ({ ...p, total_capital_usd: 1_234 }));

    const written = join(SCRATCH, 'portfolio.json');
    expect(existsSync(written)).toBe(true);
    expect(JSON.parse(readFileSync(written, 'utf-8')).total_capital_usd).toBe(1_234);
  });

  test('an explicit base directory still wins', async () => {
    const explicit = mkdtempSync(join(tmpdir(), 'antoine-explicit-'));
    const { PortfolioStore } = await import('../tools/portfolio/store.js');
    new PortfolioStore(explicit).update((p) => ({ ...p, total_capital_usd: 99 }));
    expect(existsSync(join(explicit, 'portfolio.json'))).toBe(true);
    rmSync(explicit, { recursive: true, force: true });
  });
});
