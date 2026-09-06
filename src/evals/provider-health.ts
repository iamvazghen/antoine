/**
 * Provider health check. Calls every network-backed tool once with a realistic
 * argument set and reports what actually comes back.
 *
 * This exists because unit tests could not catch the failure it was written for.
 * The ECB tools shipped with a URL the API answers 400 to, and the ECB unit test
 * passed the whole time — it asserted that a series ID started with "FM.B.U2",
 * which was true and useless. Six tools were dead in the registry for two
 * months. A dead tool is worse than a missing one: the agent spends a turn on it
 * and reports "I could not get that data" instead of falling back.
 *
 * Not a unit test: it makes real API calls, costs quota, and depends on the
 * network. Run it deliberately — `bun run health` — after touching a provider
 * or when the agent starts saying data is unavailable.
 */
import 'dotenv/config';
import { getToolRegistry } from '../tools/registry.js';
import { DEFAULT_MODEL } from '../model/llm.js';

/** One realistic call per tool. Tools absent from this list are reported as unchecked. */
const FIXTURES: Record<string, Record<string, unknown>> = {
  // --- grading engine
  grade_ticker: { ticker: 'AAPL', record: false },
  score_history: { action: 'universe' },

  // --- meta tools (financialdatasets.ai backed)
  get_financials: { query: 'AAPL revenue last year' },
  get_market_data: { query: 'AAPL stock price' },
  get_catalyst_calendar: { ticker: 'AAPL' },
  get_global_stock: { ticker: 'VOD.LSE' },

  // --- macro
  get_fred_series: { series: 'fed_funds' },
  get_fred_series_multi: { series: ['fed_funds', 'treasury_10y'] },
  get_fx_rates: { base: 'EUR', symbols: ['USD'] },
  get_economic_indicators: { country: 'DE', indicator: 'gdp' },
  ecb_policy_rate: { rate: 'deposit' },
  ecb_hicp: {},
  ecb_fx_rate: { pair: 'EURUSD' },
  bis_central_bank_rate: { country: 'US' },

  // --- equity providers
  finnhub_quote: { ticker: 'AAPL' },
  finnhub_company_profile: { ticker: 'AAPL' },
  finnhub_peers: { ticker: 'AAPL' },
  finnhub_recommendation: { ticker: 'AAPL' },
  fmp_company_profile: { ticker: 'AAPL' },
  fmp_ratios: { ticker: 'AAPL', period: 'annual', limit: 3 },
  fmp_income_statement: { ticker: 'AAPL', period: 'annual', limit: 3 },
  fmp_balance_sheet: { ticker: 'AAPL', period: 'annual', limit: 3 },
  fmp_dcf_valuation: { ticker: 'AAPL' },
  fmp_price_target: { ticker: 'AAPL' },
  fmp_stock_screener: { market_cap_more_than: 1e9, limit: 2 },
  tiingo_eod_prices: { ticker: 'AAPL', start_date: '2026-08-01', end_date: '2026-09-01' },
  tiingo_fundamentals: { ticker: 'AAPL' },
  polygon_stock_snapshot: { ticker: 'AAPL' },
  eodhd_eod_prices: { ticker: 'AAPL.US' },
  eodhd_fundamentals: { ticker: 'AAPL.US' },
  twelvedata_quote: { symbol: 'AAPL' },
  alphavantage_stock_quote: { ticker: 'AAPL' },

  // --- crypto
  coingecko_simple_price: { ids: 'bitcoin', vs_currency: 'usd' },
  cmc_quotes: { symbol: 'BTC', convert: 'USD' },
  btc_network_stats: {},

  // --- news and search
  get_news: { query: 'Apple' },
  newsapi_everything: { query: 'apple', days_back: 3, page_size: 2, language: 'en' },
  benzinga_news: { tickers: 'AAPL', days_back: 3, limit: 2 },
  marketaux_news: { symbols: 'AAPL', days_back: 3, limit: 2 },
  web_search: { query: 'Apple earnings' },
};

/**
 * Provider errors that mean "your plan", not "your code". A rate limit is
 * neither — re-run before believing a single failure, the free tiers here throttle
 * quickly when the whole sweep runs back to back.
 */
const PLAN_LIMIT = /insufficient credits|restricted endpoint|payment required|402|403|legacy endpoint|premium|subscription/i;

/** Transient throttling. Free tiers here throttle hard when the whole sweep runs back to back. */
const RATE_LIMIT = /429|too many requests|rate limit|limit reached|daily limit/i;

type Status = 'ok' | 'plan' | 'broken' | 'unchecked';

async function check(
  name: string,
  tool: { invoke: (a: unknown) => Promise<unknown> },
  args: Record<string, unknown>,
) {
  try {
    // invoke(), not func(): invoke applies the Zod schema defaults, which is how
    // the agent actually calls a tool. Calling func() directly leaves defaulted
    // fields undefined and manufactures failures that do not exist in practice.
    const out = String(await tool.invoke(args));
    const head = out.slice(0, 500);
    // Only an explicit error envelope counts as a failure. Matching plan-limit
    // words anywhere in the payload flags a web search for "403" as broken.
    const envelope = /"error"\s*:|invalid api key|no data returned/i.exec(head);
    if (envelope) {
      const status: Status = PLAN_LIMIT.test(head) ? 'plan' : 'broken';
      return { status, detail: head.slice(0, 120) };
    }
    return { status: 'ok' as Status, detail: head.slice(0, 80).replace(/\s+/g, ' ') };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: (PLAN_LIMIT.test(message) ? 'plan' : 'broken') as Status,
      detail: message.slice(0, 140),
    };
  }
}

async function main(): Promise<void> {
  const registry = getToolRegistry(DEFAULT_MODEL);
  const results: Array<{ name: string; status: Status; detail: string }> = [];

  for (const entry of registry) {
    const args = FIXTURES[entry.name];
    if (!args) {
      results.push({ name: entry.name, status: 'unchecked', detail: 'no fixture' });
      continue;
    }
    const tool = entry.tool as unknown as { invoke: (a: unknown) => Promise<unknown> };
    let r = await check(entry.name, tool, args);
    // One retry before calling anything dead: a single throttled response during
    // a back-to-back sweep is not a broken tool, and a false DEAD is exactly the
    // noise that makes a health check get ignored.
    if (r.status === 'broken') {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      r = await check(entry.name, tool, args);
      if (r.status === 'broken' && RATE_LIMIT.test(r.detail)) {
        r = { status: 'plan' as Status, detail: `rate-limited: ${r.detail}` };
      }
    }
    results.push({ name: entry.name, status: r.status, detail: r.detail });
    const mark = { ok: 'OK  ', plan: 'PLAN', broken: 'DEAD', unchecked: '--  ' }[r.status];
    console.log(`${mark} ${entry.name.padEnd(28)} ${r.detail}`);
  }

  const by = (s: Status) => results.filter((r) => r.status === s);
  console.log('\n--- summary');
  console.log(`ok:        ${by('ok').length}`);
  console.log(`plan:      ${by('plan').length}  ${by('plan').map((r) => r.name).join(' ')}`);
  console.log(`dead:      ${by('broken').length}  ${by('broken').map((r) => r.name).join(' ')}`);
  console.log(`unchecked: ${by('unchecked').length}`);

  // A plan limit is the account's problem; a dead tool is ours.
  process.exit(by('broken').length > 0 ? 1 : 0);
}

await main();
