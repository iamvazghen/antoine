---
name: reverse-dcf
description: Inverts a DCF to back out the growth rate that justifies today's stock price. Answers "what does the market think this company will grow at?" Triggers when the user asks for "reverse DCF", "implied growth", "what growth is priced in", "market expectations", or wants to compare their view to consensus.
---

# Reverse DCF Skill

Standard DCFs ask "what is the company worth?" Reverse DCFs ask the opposite: "what does the market think the company will grow at, given its current price?" The result is a powerful sanity check — if your view is materially more bullish than the implied growth, you need a specific reason.

## Workflow Checklist

```
Reverse DCF Progress:
- [ ] Step 1: Pull current price, share count, debt, cash
- [ ] Step 2: Pull LTM FCF and revenue
- [ ] Step 3: Choose a discount rate (WACC)
- [ ] Step 4: Choose a terminal growth rate
- [ ] Step 5: Solve for the 5-year FCF CAGR that justifies current price
- [ ] Step 6: Compare to your view / consensus
- [ ] Step 7: Sensitivity around WACC and terminal growth
```

## Step 1: Current Price + Capital Structure

Call `get_market_data` for `"[TICKER] price snapshot"`. Extract:
- Current share price
- Diluted shares outstanding
- Total debt
- Cash & equivalents
- Market cap (verify against `price × shares`)

## Step 2: LTM FCF

Call `get_financials` for `"[TICKER] LTM cash flow"` or sum the last 4 quarters. Standard formula: `operating_cash_flow - capital_expenditure`.

Fallback if LTM not directly available: sum the last full year (FY) free cash flow.

## Step 3: WACC

Use a sector-appropriate WACC. Defaults:
- Mega-cap US tech: 8.5-9.5%
- US large-cap industrial: 7.5-8.5%
- US small-cap / high-growth: 9.5-11%
- US regulated utility: 6-7%
- EU large-cap: 7-8%
- EM large-cap: 10-13%

For the user, default to 9% unless they specify. Cite the choice.

## Step 4: Terminal Growth Rate

Default to the long-run global GDP growth rate (2.5%) unless the sector warrants a different number:
- Reasonable: 2.0-3.0%
- High-growth tech: 3.0-4.0%
- Declining / mature: 1.0-2.0%
- Never above long-run inflation + real GDP growth (>4% is suspect)

Cite the assumption.

## Step 5: Solve for Implied 5-year FCF CAGR

This is the math. The current price implies a 5-year FCF CAGR such that the present value of all future cash flows equals the current enterprise value.

The closed-form is iterative — there's no neat algebra. Use a binary search:

```
EV = current_market_cap + total_debt - cash
g_low = -0.10  (10% decline)
g_high = 0.50   (50% growth ceiling)
tolerance = 0.001

while (g_high - g_low > tolerance):
  g_mid = (g_low + g_high) / 2
  PV = sum over 5 years: FCF_y0 * (1 + g_mid)^y / (1 + WACC)^y
       + terminal_value / (1 + WACC)^5
  if PV > EV: g_high = g_mid
  else:       g_low = g_mid

implied_growth = g_mid
```

Use `g_low = 0` for mature companies (don't allow negative growth assumption unless the business is in active decline).

## Step 6: Compare to Your View

State clearly:
- **Implied 5-year FCF CAGR**: [X]%
- **Your base-case 5-year FCF CAGR**: [Y]%
- **Consensus 5-year FCF CAGR** (from analyst estimates via `fmp_earnings_surprises` + a quick `web_search` for sell-side notes): [Z]%

If implied >> your view, the market is more bullish than you — be specific about why you're more cautious (e.g., "implied 18% requires the new product line to ramp to $X by FY27; I see $Y").

If implied << your view, you have to ask whether the market knows something you don't. Common explanations: market sees a competitive threat, accounting change, customer concentration risk.

## Step 7: Sensitivity

Run the same calculation for two more WACC values (e.g., 8% and 10%) and two more terminal growth rates (e.g., 2% and 3%). Show a small table:

| WACC \ Terminal g | 2.0% | 2.5% | 3.0% |
|-------------------|------|------|------|
| 8.0%              | 14%  | 12%  | 11%  |
| 9.0%              | 17%  | 15%  | 13%  |
| 10.0%             | 21%  | 18%  | 16%  |

(Numbers = implied 5y FCF CAGR)

This shows the user how sensitive the implied growth is to your discount-rate assumption. If the spread is huge (e.g., 10% at 8% WACC vs 25% at 10% WACC), the WACC choice is doing most of the work — flag that.

## Notes

- Reverse DCF is most useful for *differentiating* between two companies. "AAPL implies 8% growth, GOOGL implies 12% — what's GOOGL doing better?" is a sharper question than either absolute.
- For very low-growth businesses (utilities, consumer staples), implied growth is often <5%. Saying "the market is pricing in 4% growth" is not bearish on its own — it's just the input.
- Always pair with `devils-advocate` subagent.