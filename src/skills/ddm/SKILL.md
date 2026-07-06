---
name: ddm-valuation
description: Dividend Discount Model (Gordon Growth + multi-stage) for income stocks — utilities, REITs, MLPs, banks, mature consumer staples. Triggers when the user asks for "DDM", "dividend discount", "value a REIT", "utility valuation", or when the DCF skill is inappropriate (mature cash-cow business).
---

# DDM Valuation Skill

For mature, cash-generative businesses, dividend cash flow is a better proxy for shareholder value than free cash flow. The math is also simpler: a Gordon Growth Model is a closed-form equation, and multi-stage DDM requires only a few assumptions.

## Workflow Checklist

```
DDM Analysis Progress:
- [ ] Step 1: Pull dividend history
- [ ] Step 2: Pull payout ratio and earnings forecast
- [ ] Step 3: Estimate sustainable growth rate
- [ ] Step 4: Choose discount rate (cost of equity, not WACC)
- [ ] Step 5: Run Gordon Growth Model (single stage)
- [ ] Step 6: Run multi-stage DDM (high-growth → transition → terminal)
- [ ] Step 7: Compare to current price
- [ ] Step 8: Sensitivity to growth and discount rate
```

## Step 1: Dividend History

Call `get_financials`:
- `"[TICKER] dividends per share history for last 10 years"` (or call `fmp_dividends` if available)
- Compute: 5y and 10y CAGR of dividend per share (DPS)
- Note any cuts, freezes, or special dividends in the window

## Step 2: Payout Ratio + Earnings Forecast

- `payout_ratio = DPS / EPS`
- Pull consensus 5-year EPS growth from `web_search` ("[TICKER] analyst EPS growth forecast")
- Sustainable growth rate estimate (next section)

## Step 3: Sustainable Growth Rate

`sustainable_g = retention_ratio × ROE`

Where:
- `retention_ratio = 1 - payout_ratio`
- `ROE` from `get_financials` (`key_ratios`)

Cross-check vs the dividend growth rate from Step 1. If they're very different, flag the discrepancy (usually because ROE is volatile, or because the company is paying out more than it should be — risky).

For REITs (which must pay out ≥90% of taxable income), sustainable_g is the *AFFO growth rate*, not earnings growth. Use the same formula but substitute AFFO/share growth for ROE × retention.

## Step 4: Discount Rate (Cost of Equity)

Use CAPM: `r = Rf + β × ERP`

- `Rf` = 10y Treasury yield (FRED `treasury_10y`); default 4.0% if FRED unavailable
- `β` = 5y monthly beta vs S&P 500 (from `fmp_company_profile` or `key_ratios`)
- `ERP` = equity risk premium; default 5.5% (US) or 6.5% (EM)

For utilities and REITs, β is typically 0.5-0.8. For banks, 1.0-1.3. For MLPs, 1.2-1.5 (higher because of leverage + distribution dynamics).

## Step 5: Single-Stage Gordon Growth

`V = D1 / (r - g)`

Where:
- `D1` = next year's expected dividend = current DPS × (1 + g)
- `r` = cost of equity from Step 4
- `g` = sustainable growth from Step 3

**Critical check**: the model only makes sense if `r > g`. If `g ≥ r`, the formula blows up. If they're close (e.g., r=8%, g=7%), the value is hypersensitive to small changes — flag and use multi-stage.

## Step 6: Multi-Stage DDM

Use a 3-stage model for any business where growth is materially above terminal:
- **Stage 1 (Years 1-5)**: high growth at `g1` (use analyst consensus or your view)
- **Stage 2 (Years 6-10)**: transition — linearly fade from `g1` to `g_terminal`
- **Stage 3 (Year 11+)**: terminal growth at `g_terminal` (2-3% for developed markets)

```
V = sum_{t=1..5} D0 × (1+g1)^t / (1+r)^t
  + sum_{t=6..10} D0 × (1+g1)^(5) × (1+g_t)^(t-5) / (1+r)^t  (g_t interpolated)
  + TV / (1+r)^10
  where TV = D0 × (1+g1)^5 × (1+g_terminal)^5 / (r - g_terminal)
```

Use a spreadsheet or just enumerate by hand. The "transition" period (Stage 2) is what makes the answer robust vs single-stage.

## Step 7: Compare to Current Price

`upside = (V - current_price) / current_price`

Render one line: `[TICKER] DDM-implied value $X.XX vs current $Y.YY — [upside/downside] of [Z]%.`

## Step 8: Sensitivity

Two-way table: rows = `r` (8%, 9%, 10%), columns = `g` (2%, 3%, 4%):

| r \ g    | 2.0% | 3.0% | 4.0% |
|----------|------|------|------|
| 8.0%     | $X   | $Y   | $Z   |
| 9.0%     | ...  | ...  | ...  |
| 10.0%    | ...  | ...  | ...  |

This shows how brittle the answer is. If the spread between bear (8%, 2%) and bull (10%, 4%) is < 20%, the DDM is firm. If > 50%, the discount rate is doing all the work — reconsider.

## Notes

- **DDM is wrong for**: high-growth tech (use DCF), biotech (use probability-weighted pipeline), pre-profit consumer (use revenue multiples), commodity cyclicals (use mid-cycle multiples).
- **DDM is right for**: utilities, REITs, MLPs, banks, telecom, mature consumer staples, any business where dividends are a reasonable proxy for shareholder cash flow.
- For REITs, use AFFO/share, not EPS. REIT P/E is meaningless because of depreciation noise.
- For MLPs, use the distribution coverage ratio. MLPs that fund distributions with debt are not actually "high yield" — they're levered.