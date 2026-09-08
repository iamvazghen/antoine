import { withRateLimitRetry } from './provider-call.js';

/**
 * The first real 75-name universe report lost 14 consecutive tickers to Finnhub
 * 429s and published anyway. Nothing here is subtle — it just has to actually
 * retry the one status that is worth retrying, and not the ones that aren't.
 */
const FAST = [1, 1, 1] as const;

describe('rate-limit retry', () => {
  test('a 429 is retried until it succeeds', async () => {
    let calls = 0;
    const result = await withRateLimitRetry(
      'finnhub',
      async () => {
        calls++;
        if (calls < 3) throw new Error('[finnhub] request failed: 429 Too Many Requests');
        return 'ok';
      },
      FAST,
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('it gives up rather than retrying forever', async () => {
    let calls = 0;
    await expect(
      withRateLimitRetry('finnhub', async () => {
        calls++;
        throw new Error('429 Too Many Requests');
      }, FAST),
    ).rejects.toThrow('429');
    expect(calls).toBe(FAST.length + 1);
  });

  test('a non-rate-limit failure is not retried', async () => {
    // A 401 will still be a 401 in eight seconds; retrying only makes a broken
    // run slower and burns quota that a working ticker could have used.
    let calls = 0;
    await expect(
      withRateLimitRetry('fmp', async () => {
        calls++;
        throw new Error('[fmp] request failed: 401 Unauthorized');
      }, FAST),
    ).rejects.toThrow('401');
    expect(calls).toBe(1);
  });

  test('a call that works first time is not delayed', async () => {
    let calls = 0;
    expect(await withRateLimitRetry('ecb', async () => { calls++; return 42; }, FAST)).toBe(42);
    expect(calls).toBe(1);
  });
});
