---
name: earnings-preview
description: Pre-earnings preview that surfaces the consensus, key metrics to watch, historical beat/miss pattern, and trading setups. Triggers when the user asks "earnings preview", "what to expect for [TICKER]", "earnings setup", "buy before earnings?", or any time a thesis is built within 4 weeks of an earnings date.
---

# Earnings Preview Skill

Earnings dates are the most predictable source of single-day stock moves. This skill builds a structured preview so the user can decide whether to hold through, trade around, or fade.

## Workflow Checklist

```
Earnings Preview Progress:
- [ ] Step 1: Find the next earnings date
- [ ] Step 2: Pull consensus estimates (revenue, EPS, guidance)
- [ ] Step 3: Pull the last 4 quarters of beat/miss
- [ ] Step 4: Identify the 3 metrics that actually move the stock
- [ ] Step 5: Check the options market (IV rank, expected move)
- [ ] Step 6: Build the bull / base / bear case for the print
- [ ] Step 7: Suggest trade structures
```

## Step 1: Next Earnings Date

Call `get_catalyst_calendar` for `"[TICKER]"` or `"upcoming earnings in next 30 days"`. Filter to the target. Note:
- Date and time (BMO = before market open, AMC = after market close)
- Day of week (Friday AMCs historically have smaller moves; Mondays are noise-heavy)
- Days until print

## Step 2: Consensus Estimates

Call `get_financials`:
- `"[TICKER] earnings history for last 8 quarters"` → actual EPS, surprise %
- `fmp_analyst_estimates` or `web_search` for current consensus revenue + EPS estimate for the upcoming print
- The **whisper number** is sometimes different from the published consensus; flag if known

Output: `Consensus: $X.XX EPS, $Y.YY B revenue. Whisper: $X.XX EPS.`

## Step 3: Beat/Miss Pattern

For the last 8 quarters, compute:
- Beat rate (% of quarters that beat EPS consensus)
- Average surprise % on EPS
- Average surprise % on revenue
- Largest single-quarter beat and miss

Render as a small table:

| Quarter | EPS Est | EPS Act | Surprise | Rev Est | Rev Act | Rev Surprise |
|---------|---------|---------|----------|---------|---------|--------------|
| Q3 FY24 | 1.32   | 1.40   | +6.1%    | 81.0B   | 82.5B   | +1.9%       |
| ...     |         |         |          |         |         |              |

## Step 4: The 3 Metrics That Move the Stock

For most companies, the headline EPS / revenue miss or beat accounts for <40% of the stock move. The other 60%+ comes from:

- **Forward guidance** (next quarter, full year) — for many names, this is the only thing that matters
- **A specific KPI** that the buy-side tracks (e.g., GMV for Pinduoduo, FCF for SaaS, net adds for Netflix, ARPU for telcos)
- **Margin** (gross margin, operating margin) — especially in inflationary environments

For the target, name the 3 metrics that historically drive the after-hours move. Source: `read_filings` for the past 4 quarters' prepared remarks; `web_search` for sell-side previews.

## Step 5: Options Market

Pull the implied move from the options chain:
- `polygon_options_snapshot` or `web_search` for `[TICKER] implied move earnings`
- Compute: `(ATM straddle price) / stock price = implied move %`
- Compare to the 4-quarter average actual move → if actual is consistently bigger than implied, the market is underpricing the event; if smaller, it's overpricing

If options data isn't accessible, skip this step and note "no options data — implied move analysis skipped."

## Step 6: Bull / Base / Bear Case for the Print

Three scenarios for the actual print + guidance. For each, give the stock-price implication, not just the print:
- **Bull case**: beat + raise → +X% after-hours, then +Y% over the next 5 days as estimates revise
- **Base case**: in-line + hold guidance → ±Z% (typically < expected move)
- **Bear case**: miss or guide light → -X% after-hours, then continued drift

Anchor the scenarios on:
- The 3 metrics from Step 4
- Historical sensitivity (if Q3 FY24 beat by 10% and the stock moved +6%, then bull case for the next print is at least +6%)

## Step 7: Trade Structures

Three setups, depending on user's stance:

- **Long the stock into earnings**: only if the user's base case is materially more bullish than consensus AND the implied move is below the historical actual. Otherwise, the upside is priced in.
- **Sell into strength before the print**: only if the stock has run up >5% into the print AND the user's view is in-line or bearish.
- **Trade the implied move**: buy a straddle if actual move > implied; sell a straddle if actual < implied. Size on `position-sizing`.

Default recommendation: **for most setups, the right answer is to wait for the print and reassess**. Trading earnings is a negative-EV game for most participants.

## Notes

- This skill is most useful within 4 weeks of the print. Outside that window, `comps` and `dcf` are more relevant.
- For Chinese ADRs / dual-listings, note that the print time differs from US — the holding-period return can be very different depending on which exchange you're long.
- For biotech with binary readouts (FDA, Phase 3), the skill framework is the same but the analyst-consensus estimate is much less predictive; lean on the catalysts subagent.