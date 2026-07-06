/**
 * End-to-end behavioral test driver.
 *
 * Runs a hand-picked set of representative queries through the full Agent
 * stack (registry → tools → LLM → memory → sessions) and logs every tool
 * call, the final answer, tokens, and timing.
 *
 * Usage:
 *   bun run src/evals/behavioral.ts
 */
import 'dotenv/config';
import { Agent } from '../agent/agent.js';
import type { AgentEvent } from '../agent/types.js';
import { InMemoryChatHistory } from '../utils/in-memory-chat-history.js';
import { resolveProvider } from '../providers.js';
import { getActiveProviderNames, getAllProviderNames } from '../tools/finance/providers/index.js';
import { getActiveNewsProviderNames, getAllNewsProviderNames } from '../tools/news/index.js';
import { discoverSkills } from '../skills/registry.js';

interface TestCase {
  label: string;
  query: string;
  /** Tools we expect this query to involve (rough — for matching, not assertion). */
  expectAnyOf?: string[];
}

const DEFAULT_MODEL = 'minimax:MiniMax-M2.5';

const TEST_CASES: TestCase[] = [
  // 1. Simple US equity snapshot
  { label: 'AAPL price snapshot', query: "What's the current price and day's change for Apple?", expectAnyOf: ['polygon_stock_snapshot', 'finnhub_quote', 'get_stock_price', 'twelvedata_quote', 'alphavantage_stock_quote'] },
  // 2. Financial ratios — should prefer FMP per the router preference
  { label: 'NVDA valuation metrics', query: "Show me NVDA's current P/E, market cap, and revenue growth.", expectAnyOf: ['fmp_ratios', 'get_key_ratios'] },
  // 3. Multi-company comparison (router should fan out)
  { label: 'Big Tech revenue comparison', query: 'Compare 2024 annual revenue for AAPL, MSFT, GOOGL, AMZN side by side.', expectAnyOf: ['get_financials', 'fmp_income_statement', 'get_income_statements'] },
  // 4. News search — should hit news_router if active
  { label: 'Tesla news', query: "What's in the news for Tesla today?", expectAnyOf: ['get_news', 'marketaux_news', 'benzinga_news', 'newsapi_everything', 'get_company_news'] },
  // 5. US macro
  { label: 'US Fed + Treasury yields', query: 'What is the current Fed funds rate and the 10-year Treasury yield?', expectAnyOf: ['get_fred_series'] },
  // 6. Global non-US ticker (EODHD path)
  { label: 'Toyota global price', query: 'Show me Toyota (7203.TSE) latest price in JPY.', expectAnyOf: ['get_global_stock', 'eodhd_eod_prices'] },
  // 7. Crypto
  { label: 'BTC + ETH price', query: 'What is BTC at in USD right now? Same for ETH.', expectAnyOf: ['coingecko_simple_price', 'cmc_quotes', 'alphavantage_crypto_rating', 'get_crypto_price_snapshot'] },
  // 8. High-conviction trade — should auto-fire run_debate per Phase C behavior
  { label: 'High-conviction trade (auto-debate)', query: "Should I buy NVDA here for a 12-month hold? I have $500k and a 1% risk budget.", expectAnyOf: ['run_debate', 'get_financials', 'get_market_data', 'devils-advocate', 'macro-overlay'] },
];

interface TestOutcome {
  label: string;
  query: string;
  answer: string;
  toolCalls: string[];
  toolsExpected: string[];
  toolsExpectedMatched: boolean;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  errored: boolean;
  error?: string;
}

function indent(text: string, prefix = '  │ '): string {
  return text.split('\n').map((l) => (l ? prefix + l : l)).join('\n');
}

async function runOne(test: TestCase): Promise<TestOutcome> {
  const history = new InMemoryChatHistory(DEFAULT_MODEL);
  const t0 = Date.now();
  const toolCalls: string[] = [];
  let iterations = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let answer = '';
  let errored = false;
  let error: string | undefined;

  try {
    const agent = await Agent.create({ model: DEFAULT_MODEL, maxIterations: 12, channel: 'cli' });
    for await (const ev of agent.run(test.query, history)) {
      const e = ev as AgentEvent;
      switch (e.type) {
        case 'tool_start':
          toolCalls.push(e.tool);
          break;
        case 'done':
          iterations = (e as { iterations: number }).iterations;
          const u = (e as { tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } }).tokenUsage;
          if (u) {
            inputTokens = u.inputTokens;
            outputTokens = u.outputTokens;
            totalTokens = u.totalTokens;
          }
          answer = (e as { answer: string }).answer;
          break;
      }
    }
  } catch (err) {
    errored = true;
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    label: test.label,
    query: test.query,
    answer,
    toolCalls,
    toolsExpected: test.expectAnyOf ?? [],
    toolsExpectedMatched: test.expectAnyOf
      ? toolCalls.some((t) => test.expectAnyOf!.includes(t))
      : true,
    iterations,
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: Date.now() - t0,
    errored,
    error,
  };
}

async function staticFacts(): Promise<void> {
  const activeFinance = getActiveProviderNames();
  const allFinance = getAllProviderNames();
  const activeNews = getActiveNewsProviderNames();
  const allNews = getAllNewsProviderNames();
  const skills = discoverSkills();

  console.log('\n' + '═'.repeat(80));
  console.log('  STATIC FACTS — verified before live run');
  console.log('═'.repeat(80));
  console.log(`Provider: model=${DEFAULT_MODEL}, resolved=${resolveProvider(DEFAULT_MODEL).displayName}`);
  console.log(`Active finance providers (${activeFinance.length}/${allFinance.length}):`);
  for (const n of activeFinance) console.log(`  • ${n}`);
  console.log(`Missing finance providers (${allFinance.length - activeFinance.length}):`);
  for (const n of allFinance.filter((x) => !activeFinance.includes(x))) console.log(`  • ${n}`);
  console.log(`Active news providers (${activeNews.length}/${allNews.length}):`);
  for (const n of activeNews) console.log(`  • ${n}`);
  console.log(`Skills discovered (${skills.length}): ${skills.map((s) => s.name).join(', ')}`);

  // Cross-check the router prompt itself includes the active providers.
  // (Internal helper, not exported — skipped here. Verified manually in Part 4 audit.)
  void activeFinance;
}

async function main(): Promise<void> {
  console.log('Antoine — end-to-end behavioral test');
  console.log('═'.repeat(80));
  await staticFacts();

  console.log('\n' + '═'.repeat(80));
  console.log('  LIVE BEHAVIORAL TESTS');
  console.log('═'.repeat(80));

  const outcomes: TestOutcome[] = [];
  for (const test of TEST_CASES) {
    process.stdout.write(`\n[${test.label}] running: ${test.query}\n`);
    const result = await runOne(test);
    outcomes.push(result);
    if (result.errored) {
      console.log(`  ✗ errored: ${result.error}`);
      continue;
    }
    console.log(`  ✓ completed in ${result.durationMs}ms · ${result.iterations} iter · ${result.totalTokens} tokens`);
    console.log(`  Tool calls (${result.toolCalls.length}):`);
    for (const t of result.toolCalls) console.log(`    - ${t}`);
    if (result.toolsExpected.length > 0) {
      console.log(`  Expected match: ${result.toolsExpectedMatched ? 'YES' : 'NO'}`);
      if (!result.toolsExpectedMatched) {
        console.log(`    Expected one of: ${result.toolsExpected.join(', ')}`);
      }
    }
    const preview = result.answer.length > 500 ? result.answer.slice(0, 500) + '…[truncated]' : result.answer;
    console.log(indent('\n  Answer:\n' + (preview || '(empty)')));
    console.log('  ' + '─'.repeat(76));
  }

  console.log('\n' + '═'.repeat(80));
  console.log('  SUMMARY');
  console.log('═'.repeat(80));
  const total = outcomes.length;
  const ok = outcomes.filter((o) => !o.errored).length;
  const matched = outcomes.filter((o) => o.toolsExpectedMatched).length;
  const totalTokensUsed = outcomes.reduce((s, o) => s + o.totalTokens, 0);
  const totalDuration = outcomes.reduce((s, o) => s + o.durationMs, 0);
  console.log(`Tests run: ${total}`);
  console.log(`Completed: ${ok}/${total}`);
  console.log(`Expected-tool match: ${matched}/${total}`);
  console.log(`Total tokens: ${totalTokensUsed.toLocaleString()}`);
  console.log(`Total wall time: ${(totalDuration / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Behavioral test driver error:', err);
  process.exit(1);
});