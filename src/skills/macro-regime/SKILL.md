---
name: macro-regime
description: Classifies the current US macro regime (goldilocks, reflation, stagflation, disinflation, recession) using FRED data, then translates the classification into actionable sector/asset implications. Triggers when the user asks "what's the macro setup", "what regime are we in", "macro outlook", "should I be in cyclicals or defensives", or before any portfolio-level recommendation.
---

# Macro Regime Detection Skill

Markets move in regimes — periods of months to years where one type of asset wins. Getting the regime right (or at least being honest about being wrong) is more valuable than picking the right stock.

## Workflow Checklist

```
Macro Regime Detection Progress:
- [ ] Step 1: Pull the four macro variables
- [ ] Step 2: Compute year-over-year changes
- [ ] Step 3: Classify the regime
- [ ] Step 4: Map to sector/asset implications
- [ ] Step 5: Compute historical analog (when did this combo last occur?)
- [ ] Step 6: Confidence + caveats
```

## Step 1: Pull the Four Macro Variables

Call `get_fred_series` four times:
- **CPI YoY**: `series='cpi_yoy'` (this is the only one we pre-compute as % change — easier than doing it from raw)
- **Fed funds rate**: `series='fed_funds'`
- **Unemployment**: `series='unemployment'`
- **Real GDP**: `series='gdp'` (this is the most-recent quarterly print)

For each, pull **the last 8-12 observations** so you can compute YoY yourself.

## Step 2: Compute YoY Changes

For each series, compute the most recent YoY % change:
- **CPI YoY** = `latest_CPI / CPI_12_months_ago - 1` (in %)
- **Fed funds change** = `latest_fed_funds - fed_funds_12_months_ago` (in bps)
- **Unemployment change** = `latest_unemployment - unemployment_12_months_ago` (in pp)
- **Real GDP growth** = `(latest_GDP / GDP_4_quarters_ago - 1) * 100` (in %)

If `get_fred_series cpi_yoy` worked, skip the manual CPI calc.

## Step 3: Classify the Regime

Five regimes. Two simple rules:

**Axis 1 — Inflation direction (CPI YoY)**:
- **Rising**: latest CPI YoY > 3.0%, OR CPI YoY rose > 0.5pp over the last 6 months
- **Falling**: latest CPI YoY < 2.5% AND falling

**Axis 2 — Growth direction (Real GDP YoY)**:
- **Rising**: latest GDP YoY > 2.0%
- **Falling**: latest GDP YoY < 1.5% OR unemployment rose > 0.3pp YoY

Cross the two axes:

| | Inflation Rising | Inflation Falling |
|---|---|---|
| **Growth Rising** | Reflation | Goldilocks |
| **Growth Falling** | Stagflation | Disinflation / Recession |

**Recession** is a special case of disinflation where unemployment is rising rapidly (>0.5pp YoY) AND Sahm rule (>0.5pp 3-month moving average rise).

State the classification explicitly:
**Regime: [goldilocks/reflation/stagflation/disinflation/recession]**
- CPI YoY: X.X% ([direction])
- GDP YoY: X.X% ([direction])
- Fed funds: X.XX% ([direction over 12mo: +/-Ybps])

## Step 4: Sector / Asset Implications

For each regime, the historical playbook:

**Goldilocks** (best for risk assets):
- Overweight: equities (broad), growth stocks, IG credit, REITs, EM equities
- Underweight: long-duration Treasuries, defensives, gold
- Typical horizon: 12-24 months before regime change

**Reflation** (early-cycle, pro-risk):
- Overweight: cyclicals, value, small-cap, EM equities, commodities, high-yield credit
- Underweight: long-duration Treasuries, defensives, growth
- Typical horizon: 6-12 months before tightening bites

**Stagflation** (worst for portfolios):
- Overweight: commodities, gold, TIPS, value, cash
- Underweight: long-duration bonds, growth stocks, REITs
- Typical horizon: quarters to years — typically ends in recession

**Disinflation** (late-cycle, mid-recession):
- Overweight: high-quality bonds (long duration), defensives, dividend stocks, healthcare
- Underweight: cyclicals, small-cap, commodities, REITs
- Typical horizon: quarters before next easing cycle begins

**Recession** (deepest trough):
- Overweight: long-duration Treasuries, IG credit, defensives (utilities, staples, healthcare), gold
- Underweight: cyclicals, small-cap, REITs, high-yield credit
- Typical horizon: 6-18 months before recovery

State the **3-month regime outlook**: is the regime stable, deteriorating, or improving? Use direction-of-change of all 4 variables. If Fed is hiking while CPI is falling and GDP is slowing, you're transitioning reflation → disinflation.

## Step 5: Historical Analog

Find the most recent period where this combo of (inflation direction, growth direction) occurred. Examples:
- 2022 H2: Reflation → Stagflation as Fed hiked
- 2009 H1: Goldilocks (post-recession)
- 2020 H2-2021 H1: Goldilocks → Reflation as vaccines + stimulus hit

Use `web_search` if needed: "[current CPI/GDP combo] historical analog macro regime".

Cite 1-2 sentences on what happened after.

## Step 6: Confidence + Caveats

State confidence as `[low / med / high]` based on:
- How clear the directional signals are
- Whether the four variables agree
- Whether we're near a regime boundary

Add 1-2 caveats:
- The 4-variable framework misses credit conditions, yield curve, USD strength. Mention if any of these is flashing a different signal.
- Lag effects: Fed policy hits the economy with 12-18 month lags.

## Notes

- **US-centric**: This framework uses US data (FRED). For a global view, pull ECB, BoJ, PBoC rates (Trading Economics key needed). Different countries can be in different regimes simultaneously.
- **Regime transitions are the money**: the biggest returns come from getting the regime-change right, not from being right within a regime.
- **Don't re-classify daily**: regimes last months. Re-run this skill quarterly at most. For more frequent updates, look at the FRED Nowcast series.