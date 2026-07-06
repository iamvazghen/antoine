---
name: comps-valuation
description: Compares a stock against a peer set on the trading multiples that drive the sector (EV/EBITDA, EV/Sales, P/E, P/B, FCF yield). Triggers when the user asks for "comps", "comparable companies", "peer multiples", "trading multiples", "relative valuation", "how does X compare to peers", or wants to know if a stock is cheap vs its industry.
---

# Comps Valuation Skill

Compares a stock's trading multiples against a peer group. Used when the user wants to know if a stock is cheap or expensive vs its industry — the workhorse of relative-value investing.

## Workflow Checklist

```
Comps Analysis Progress:
- [ ] Step 1: Define the peer set
- [ ] Step 2: Pull fundamentals for target + peers
- [ ] Step 3: Compute trading multiples
- [ ] Step 4: Build comparison table
- [ ] Step 5: Adjust for one-off items (optional)
- [ ] Step 6: State the relative-value conclusion
```

## Step 1: Define the Peer Set

Two paths:
- **User supplied peers** — use as-is. Common 4-6 names.
- **No peers supplied** — call `stock_screener` or `finnhub_peers` (Finnhub's curated peer set is a good default). Pull 4-6 close comps.

For sector coverage:
- US tech: Polygon/Finnhub (very deep)
- Non-US: EODHD `TICKER.EXCHANGE` notation; see `get_global_stock` for currency normalization
- Crypto: skip (no comparable multiples)

## Step 2: Pull Fundamentals for Target + Peers

Call `get_financials` for each ticker in the set. For each, request:
- `"[TICKER] financial metrics snapshot"` → market cap, EV, P/E, P/S, P/B, EV/EBITDA, EV/Sales, FCF yield
- `"[TICKER] annual income statement for the last 2 years"` → revenue, EBITDA (op income + D&A), net income

## Step 3: Compute Trading Multiples

Per ticker:
- **EV** = market cap + total debt − cash & equivalents
- **EV/Revenue** = EV / TTM revenue
- **EV/EBITDA** = EV / TTM EBITDA
- **P/E** = market cap / TTM net income
- **FCF Yield** = TTM FCF / market cap
- **P/B** = market cap / book equity
- **PEG** = P/E / (5y earnings growth %)

Pull EBITDA = `operating_income + depreciation_and_amortization`. If D&A not directly given, use `operating_cash_flow - net_income + change_in_working_capital` or approximate as 5-8% of revenue for asset-light businesses, 3-5% for asset-heavy.

## Step 4: Build Comparison Table

Render a markdown table with one column per ticker. For each multiple, also report the **peer-group mean and median** so the user can see dispersion.

| Ticker | Mkt Cap | EV/Rev | EV/EBITDA | P/E | FCF Yield |
|--------|---------|--------|-----------|-----|-----------|
| AAPL   | 3.0T    | 7.5x   | 22.0x     | 30x | 3.5%      |
| MSFT   | 2.8T    | 11.0x  | 25.0x     | 34x | 2.8%      |
| GOOGL  | 2.1T    | 5.0x   | 17.0x     | 24x | 4.2%      |
| ...    |         |        |           |     |           |
| **Median** |     | 7.5x   | 22.0x     | 30x | 3.5%      |

Keep columns ≤6 per table. If you need more, split into two tables (valuation vs profitability).

## Step 5: Adjust for One-Off Items (Optional)

If the user asks for "adjusted" or "ex-cash" comps, recompute EV using only long-term debt and excluding short-term investments. Otherwise, present raw GAAP numbers and note any outliers in a footnote-style remark below the table.

## Step 6: State the Relative-Value Conclusion

Lead with one line: `[TICKER] trades at [N]x EV/EBITDA vs peer median [M]x — [cheap / fair / expensive] by [K]%.`

Then 2-3 sentences on:
- What's driving the discount/premium (growth, margin, business model, market positioning)
- Any structural reason the multiple should differ (e.g., Apple deserves a premium for services mix, Boeing deserves a discount until 737 MAX resolves)
- Whether the gap is likely to close, and what would have to happen

Cite every number with `[N]` markers from the data sources.

## Notes

- For multi-region peers (e.g., Toyota vs GM), normalize to a common currency. The `get_global_stock` tool returns prices in local currency; cross-check via `get_fx_rates`.
- For loss-making companies, P/E is meaningless — use EV/Revenue or EV/EBITDA only. Note this when the target or any peer has negative net income.
- For financial companies (banks, insurance), skip EV/EBITDA. Use P/B and P/TBV (tangible book) instead.