# Antoine

**Antoine** is a self-hosted, terminal-native financial-research agent built for serious investors. It lives in your terminal, your WhatsApp, and your Telegram — and it does the work of a junior analyst: pulling live data across **74 tools**, citing every claim, running a multi-agent debate on every high-conviction trade, and remembering your portfolio between sessions.

It defaults to a locally-proxied model (no API key required to start) but is wired to **10 LLM providers** (OpenAI · Anthropic · Google · xAI · DeepSeek · Moonshot · OpenRouter · minimax · FreeLLMAPI · Ollama) so you can pick the right model per query type.

---

## Table of Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tool inventory](#tool-inventory)
- [Skills](#skills)
- [Subagent system](#subagent-system)
- [Channel profiles](#channel-profiles)
- [Memory + portfolio](#memory--portfolio)
- [Prerequisites](#prerequisites)
- [Install](#install)
- [Run](#run)
- [Slash commands](#slash-commands)
- [Evaluate](#evaluate)
- [Debug](#debug)
- [WhatsApp + Telegram gateways](#whatsapp--telegram-gateways)
- [Cost model](#cost-model)
- [Third-party data attribution + licenses](#third-party-data-attribution--licenses)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## What it does

Antoine takes a question like *"is NVDA cheap relative to peers given the AI capex cycle?"* and runs an end-to-end research workflow:

1. **Plans** — picks the right tools (equity quotes? financials? news? filings?) and issues them in parallel where independent.
2. **Sources** — pulls from **74 financial tools** covering US equities, global equities (LSE, TSE, HK, NSE, …), crypto, FX, commodities, macro (FRED, World Bank, ECB), real estate, SEC filings, news from 4 providers, and on-chain crypto.
3. **Cross-checks** — when providers disagree, it surfaces both. Every data point carries a freshness stamp (`Polygon · 14:32 UTC`) and a numbered citation.
4. **Argues** — for any high-conviction trade it spawns a 4-specialist debate (bull / bear / quant / macro) and a judge subagent that synthesizes a structured `Decision · Conviction · Time horizon`.
5. **Remembers** — your portfolio, risk tolerance, prior trades, and stated rules live in `.antoine/` and are auto-injected into every system prompt.

The output is **opinionated, source-cited, falsifiable** — it leads with the answer, attaches citations to every claim, and includes bear-case risks for any recommendation. The agent is **explicitly permitted to disagree with the user's priors** and to call out weak theses.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Antoine CLI/WhatsApp/Telegram                                     │
│   • pi-tui terminal UI (themeable, source chips, watchlist,        │
│     command palette, status bar, cost-cap overlay, diff viewer)    │
│   • Slash commands (/model /theme /cost /watch /run_debate …)       │
└──────────────────┬───────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼────┐         ┌─────▼──────┐
   │  Agent  │ ──────▶ │ Subagents │ (bull / bear / quant / macro / judge)
   │  loop   │         │           │
   └────┬────┘         └───────────┘
        │
   ┌────▼───────────────────────────────────────┐
   │  74 tools                                  │
   │   • Meta-tools (router)                    │
   │   • Leaf tools (per-provider)              │
   │   • Skills (multi-step workflows)          │
   └────┬───────────────────────────────────────┘
        │
   ┌────▼───────────────────────────────────────┐
   │  Providers (env-gated, all disk-cached,    │
   │  freshness-stamped, numbered citations)    │
   │   FinancialDatasets · Polygon · Finnhub ·  │
   │   FMP · Alpha Vantage · TwelveData ·       │
   │   Tiingo · EODHD · CoinGecko · CMC ·       │
   │   FRED · World Bank · ECB · RentCast ·     │
   │   Realtor · NewsAPI · Marketaux · Benzinga │
   └────────────────────────────────────────────┘
```

Key design choices:
- **Single-pass tool execution per turn** — the agent loop calls multiple tools in parallel when independent (via `Promise.all`), then merges results with numbered citations.
- **Per-provider disk cache** — `callProvider({ provider, endpoint, params, url, ttlMs })` keys by provider + endpoint + sorted params. Reduces API quota burn for repeat queries.
- **Provider fallback chains** — `withProviderFallback([Polygon, Finnhub, FMP, …])` for the meta-tools. Polygon rate-limits you? The next provider picks up.
- **Multi-region normalization** — non-US tickers use `TICKER.EXCHANGE` notation (`VOD.LSE`, `7203.TSE`, `RELIANCE.NSE`). Prices are tagged with local currency (GBp, JPY, INR).

---

## Tool inventory

74 tools, all env-gated. With zero env keys set, only the system tools (memory, filesystem, browser, scheduling, subagents, skills) are available.

### Core meta-tools (always available)

| Tool | What it does |
|---|---|
| `get_financials` | NL → financial-statement fetcher. Routes to the best of 7 income/balance/cash-flow providers based on the query (FMP preferred for US, EODHD for global). |
| `get_market_data` | NL → price/news/insider fetcher. Routes across 8 quote providers, 3 crypto providers, 4 news providers with preference order. |
| `read_filings` | SEC 10-K / 10-Q / 8-K with item-level extraction. |
| `stock_screener` | NL → structured screener filters (PE, growth, margins, sector). |
| `get_news` | Routes ticker-specific news to Marketaux/Benzinga; broad topic to NewsAPI. |
| `get_global_stock` | Non-US tickers via EODHD with local-currency normalization. |
| `get_catalyst_calendar` | Upcoming earnings + EPS/revenue estimates (FMP → Finnhub fallback). |
| `get_commodity` | Oil/BRENT/NatGas/copper/wheat/etc. via Alpha Vantage + FRED fallback. |
| `get_fx_rates` | ECB/Frankfurter. No key required. |
| `get_economic_indicators` | World Bank. No key required. |
| `get_fred_series` | US Fed funds, Treasury yields, CPI, unemployment, GDP. |

### Leaf tools (one per provider, env-gated)

| Provider | Coverage |
|---|---|
| `polygon_stock_snapshot`, `polygon_stock_aggregates`, `polygon_forex_snapshot` | US stocks real-time + EOD |
| `finnhub_quote`, `finnhub_company_profile`, `finnhub_peers`, `finnhub_recommendation`, `finnhub_sentiment`, `finnhub_earnings_calendar` | Analyst sentiment + earnings |
| `fmp_company_profile`, `fmp_ratios`, `fmp_dcf_valuation`, `fmp_income_statement`, `fmp_balance_sheet`, `fmp_earnings_calendar`, `fmp_stock_screener`, `fmp_earnings_surprises`, `fmp_price_target` | Fundamentals + DCF + analyst targets |
| `alphavantage_stock_quote`, `alphavantage_stock_time_series`, `alphavantage_fx_rate`, `alphavantage_crypto_rating`, `alphavantage_commodity` | Equities, FX, crypto, commodities |
| `twelvedata_time_series`, `twelvedata_quote`, `twelvedata_fx_rate` | Global equities + FX |
| `tiingo_eod_prices`, `tiingo_fundamentals` | US EOD + fundamentals |
| `eodhd_eod_prices`, `eodhd_fundamentals` | Global (TICKER.EXCHANGE) |
| `coingecko_simple_price`, `coingecko_markets`, `coingecko_global_metrics` | Crypto |
| `cmc_listings`, `cmc_quotes`, `cmc_global_metrics` | Crypto (alt) |
| `rentcast_rent_estimate`, `rentcast_value_estimate` | US real estate |
| `realtor_properties_for_sale` | US real estate listings |
| `newsapi_everything`, `marketaux_news`, `benzinga_news` | News |

### System tools

`memory_search`, `memory_get`, `memory_update`, `cron`, `heartbeat`, `spawn_subagent`, `run_debate`, `ask_user_question`, `web_search`, `web_fetch`, `browser`, `read_file`, `write_file`, `edit_file`, `skill`, plus 5 **portfolio tools** (`portfolio_view`, `portfolio_add`, `portfolio_remove`, `portfolio_journal`, `portfolio_set_risk`).

---

## Skills

Multi-step workflows invoked via the `skill` tool. Each is a `SKILL.md` with YAML frontmatter and a numbered workflow checklist.

| Skill | When it triggers |
|---|---|
| `dcf-valuation` | "fair value", "intrinsic value", "what is X worth", price target |
| `comps-valuation` | "comps", "peer multiples", "trading multiples", relative value |
| `ddm-valuation` | "DDM", "dividend discount", utilities/REITs/MLPs |
| `reverse-dcf` | "implied growth", "what does the market think", reverse-engineering consensus |
| `earnings-preview` | "earnings preview", "what to expect", within 4 weeks of print |
| `position-sizing` | "how much should I buy", "Kelly", "size this" — always reads portfolio_view first |
| `trade-review` | Closed-trade post-mortem; hit rate + profit factor + lessons |
| `macro-regime` | "what regime are we in" — goldilocks/reflation/stagflation/recession classification |
| `write-memo` | "write a memo", "long writeup" — buyside-style HTML memo |
| `x-research` | X/Twitter sentiment research |

---

## Subagent system

6 subagent types; the leader spawns them via `spawn_subagent` (single, parallel) or `run_debate` (structured 4-specialist + judge).

| Type | Job |
|---|---|
| `general-purpose` | Multi-step research / analysis on a focused sub-task |
| `research` | Web/news/filings synthesis with cross-checks |
| `analysis` | Quantitative financial analysis on specific companies |
| `devils-advocate` | Stress-test a thesis by falsifying load-bearing claims |
| `macro-overlay` | Pull FRED + FX + sector data, write 150-250 word macro block |
| `judge` | Read 4 specialist outputs, synthesize into `Decision · Conviction · Time horizon` |

Subagents are **isolated** (no main-conversation context, no further delegation), **read-only** by default (no `write_file` / `edit_file`), and have capped iteration budgets (4-8).

---

## Channel profiles

The agent adapts its response format per delivery channel.

| Channel | Style |
|---|---|
| CLI | Compact, lead with the answer, markdown tables OK, citations inline |
| WhatsApp | Casual texting tone, no headers, no tables, short paragraphs |

When the user enables another channel, set `channel` in the `AgentConfig` — the system prompt pulls the matching profile.

---

## Memory + portfolio

Three persistent stores under `.antoine/`:

| File | Format | Purpose |
|---|---|---|
| `memory/MEMORY.md` | Markdown | Long-term preferences, facts about the user |
| `memory/YYYY-MM-DD.md` | Markdown | Daily notes |
| `portfolio.json` | JSON | Open positions, closed history, journal, risk profile |

The **portfolio store** tracks thesis + conviction + target + stop per position; closed positions record realized P&L + lesson. The system prompt auto-injects a compact portfolio summary so the agent always knows your book without spending a tool call.

---

## Prerequisites

- [Bun](https://bun.com) runtime v1.0+
- A working internet connection (most data sources are HTTP)
- At minimum one LLM API key — see [LLM Providers](#llm-providers)
- (Optional) One or more data provider keys — see [Data providers](#data-providers)

---

## Install

```bash
git clone https://github.com/iamvazghen/antoine.git
cd antoine
bun install
cp env.example .env
$EDITOR .env   # fill in your keys
```

The first run will prompt for any missing keys.

---

## Run

```bash
bun start                 # interactive CLI
bun dev                   # watch mode for development
bun run src/index.tsx     # equivalent to bun start
```

The CLI launches a TUI with a banner, status bar (model · tokens · cost · iter · t/s), command palette (`Ctrl+P`), watchlist sidebar, and input area. Slash commands are auto-completed.

---

## Slash commands

| Command | What it does |
|---|---|
| `/model` | Switch LLM provider and model |
| `/search` | Choose preferred web search provider |
| `/theme` | Switch color theme (emerald · sapphire · amethyst · obsidian) |
| `/rules` | Show research rules |
| `/clear` | Clear the conversation |
| `/memory` | Show what Antoine remembers about you |
| `/history` | Show recent conversation summaries |
| `/sessions` / `/resume` | List / resume saved sessions |
| `/palette` | Open the fuzzy command palette (also `Ctrl+P`) |
| `/providers` | Show which roadmap data providers are active |
| `/cost` | Show running session cost; `/cost cap 5` to set a $5 cap |
| `/watch` | `/watch AAPL NVDA` — add tickers to the live watchlist sidebar |
| `/unwatch` | `/unwatch AAPL` |
| `/watchlist` | Show current watchlist |
| `/help` | Show keyboard shortcuts |

Keyboard shortcuts: `Esc` interrupt · `Ctrl+C` exit · `Ctrl+P` command palette · `↑/↓` history.

---

## Evaluate

Antoine ships with a finance-specific eval suite (236 questions, LangSmith-backed):

```bash
bun run src/evals/run.ts            # full suite
bun run src/evals/run.ts --sample 10  # 10-question smoke test
```

The eval uses an LLM-as-judge to score correctness against ground-truth answers from the dataset.

---

## Debug

Every query creates a JSONL file in `.antoine/scratchpad/` with:
- The original query
- Every tool call (args + raw result + LLM summary)
- The agent's reasoning chain

This makes it easy to inspect exactly what data the agent pulled and how it interpreted each result. Set `ANTOINE_DEBUG=1` to also surface a live log panel in the TUI.

---

## WhatsApp + Telegram gateways

```bash
bun run gateway:login    # scan WhatsApp QR
bun run gateway:telegram # paste BotFather token, set DM allowlist
bun run gateway          # start both gateways
```

Messages you send to yourself over WhatsApp are processed by Antoine and replied to in the same chat. Telegram uses Bot API long-polling. Both channels use the WhatsApp / Telegram profile (no headers, no tables).

---

## Cost model

Per-call USD cost is estimated from a public list-price table (`src/utils/cost.ts`). The session bar shows running totals. Set a cap with `/cost cap 5` — a one-time overlay warns when you cross it and offers to continue, switch to a cheaper model, or end the session.

Real billing varies by tier, region, and provider discounts. The estimate is conservative.

---

## LLM Providers

Set any of these in `.env` to enable. Pick one — or several if you want to hot-swap per query.

| Provider | Env var | Notes |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | Default for gpt-5.x models |
| Anthropic | `ANTHROPIC_API_KEY` | Cache-control prompt caching saves ~90% on repeated system prompts |
| Google | `GOOGLE_API_KEY` | Gemini 1M-token context window |
| xAI | `XAI_API_KEY` | Grok |
| Moonshot | `MOONSHOT_API_KEY` | Kimi K2 |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek V4 Pro/Flash |
| OpenRouter | `OPENROUTER_API_KEY` | One key, any model |
| minimax | `MINIMAX_API_KEY` | Primary default provider |
| FreeLLMAPI | `FREELLMAPI_API_KEY` | Local proxy, no per-model key |
| Ollama | `OLLAMA_BASE_URL` | Fully local, no key needed |

Default model: `minimax:m2.5`.

---

## Data providers

All data providers are **optional**. Set the keys you care about; the rest stay dormant.

### Free (no key required)

| Provider | Coverage |
|---|---|
| Frankfurter / ECB | FX rates (all major currencies) |
| World Bank Open Data | Macro indicators for 200+ countries |
| FRED | US Fed funds, Treasury yields, CPI, unemployment, GDP |
| ECB SDMX | Eurozone policy rates, HICP inflation, FX |
| Bank of England | UK Bank Rate + CPI inflation |
| BIS | Cross-country central bank policy rates |
| Bitcoin via Blockchain.com | On-chain supply, block height, mempool |

### Free with API key (rate-limited)

| Provider | Coverage | Free tier |
|---|---|---|
| Alpha Vantage | US stocks, FX, crypto, **commodities** | 25 calls/day |
| Finnhub | US stocks + earnings + sentiment | 60 calls/min |
| Polygon | US stocks, options, FX | 5 calls/min |
| FMP | US fundamentals + DCF + analyst targets | 250 calls/day |
| Twelve Data | Global equities + FX + crypto | 800 calls/day |
| Tiingo | US EOD + fundamentals | 1000 calls/day |
| EODHD | **Global equities (TICKER.EXCHANGE)** + fundamentals | 20 calls/day |
| CoinGecko | Crypto prices + global metrics | 10-30 calls/min |
| CoinMarketCap | Crypto listings + quotes | 333 calls/day |
| FRED | US macro | 120 calls/min |
| RentCast | US rent estimates + AVM | 50 calls/month |
| Realtor via RapidAPI | US listings | varies |
| NewsAPI | News headlines | 100 calls/day |
| Marketaux | News with entity sentiment | 100 calls/day |
| Benzinga | Market-moving news | varies |
| X / Twitter | Tweet search | Free tier exists |

See `env.example` for the full list with keys. **Paid providers** (Bloomberg, Trading Economics, Glassnode, etc.) are intentionally **not included** — this project ships with free tiers only.

---

## Third-party data attribution + licenses

This project integrates with the following third-party data providers. Each provider retains its own terms of service; the data they return is owned by them, not by Antoine. Use of each provider is governed by their respective license/terms:

| Provider | License / Terms |
|---|---|
| Alpha Vantage | https://www.alphavantage.co/terms_of_use/ |
| Financial Datasets | https://www.financialdatasets.ai/terms |
| Finnhub | https://finnhub.io/terms |
| FMP (Financial Modeling Prep) | https://site.financialmodelingprep.com/terms |
| Polygon.io | https://polygon.io/terms |
| Twelve Data | https://twelvedata.com/terms |
| Tiingo | https://api.tiingo.com/terms |
| EOD Historical Data | https://eodhd.com/terms |
| CoinGecko | https://www.coingecko.com/en/api_terms |
| CoinMarketCap | https://coinmarketcap.com/terms |
| FRED (Federal Reserve Bank of St. Louis) | FRED data is in the public domain; see https://fred.stlouisfed.org/ |
| World Bank Open Data | https://data.worldbank.org/summary-terms-of-use |
| ECB / Frankfurter | ECB data policy: https://www.ecb.europa.eu/services/ecb-data-policy/html/index.en.html |
| Bank of England (BoE) | https://www.bankofengland.co.uk/legal/terms-and-conditions |
| BIS (Bank for International Settlements) | https://www.bis.org/terms_policies.htm |
| Blockchain.com | Free public REST API — https://www.blockchain.com/explorer/api/blockchain_api |
| RentCast | https://www.rentcast.io/terms |
| RapidAPI | https://rapidapi.com/terms |
| NewsAPI | https://newsapi.org/terms |
| Marketaux | https://www.marketaux.com/terms |
| Benzinga | https://www.benzinga.com/terms |
| Exa | https://exa.ai/terms |
| Perplexity | https://www.perplexity.ai/terms |
| Tavily | https://tavily.com/terms |
| LangSearch | https://langsearch.com/terms |
| X / Twitter | https://twitter.com/en/tos |
| Baileys (WhatsApp) | MIT License — https://github.com/WhiskeySockets/Baileys |
| Playwright (browser automation) | Apache 2.0 — https://playwright.dev/ |
| LangChain (LLM framework) | MIT License |
| LangSmith (eval tracing) | https://smith.langchain.com/terms |
| pi-tui (terminal UI library) | MIT License — https://github.com/badlogic/pi-mono |

Open-source dependencies are listed in `package.json` with their respective licenses (mostly MIT, Apache 2.0, BSD).

---

## License

[MIT](LICENSE) © 2024–2026 Antoine contributors.

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, subject to the MIT License terms. **Data returned by the third-party providers above is not covered by the MIT license** — it remains governed by each provider's own terms.

---

## Disclaimer

⚠️ **This project is for educational, entertainment, and informational purposes only. It is not intended for real trading or investment.**

- Not financial, investment, tax, or legal advice
- No guarantees of accuracy, completeness, or fitness for any purpose
- Outputs may be incorrect, incomplete, or out of date — verify everything
- Creator and contributors assume no liability for any financial losses or damages
- Consult a licensed financial advisor before making investment decisions
- Past performance does not indicate future results

By using this software, you agree to use it solely for learning and informational purposes and accept all risks associated with its use.