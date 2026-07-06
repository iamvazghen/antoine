---
name: position-sizing
description: Computes position size for a new idea using Kelly criterion, vol-targeting, and the user's stated risk tolerance. Triggers when the user asks "how much should I buy", "position size", "Kelly", "how to size this", "risk per trade", or before any buy/sell recommendation.
---

# Position Sizing Skill

The most-overlooked step in investing. A great idea with bad sizing is a great way to lose money. This skill sizes positions to a stated risk budget and a stated edge.

## Workflow Checklist

```
Position Sizing Progress:
- [ ] Step 1: Recall user's risk tolerance from memory
- [ ] Step 2: Pull volatility for the target
- [ ] Step 3: Pull the user's stated edge (probability of working)
- [ ] Step 4: Choose a sizing method
- [ ] Step 5: Compute the size
- [ ] Step 6: Sanity-check against existing positions (correlation, concentration)
- [ ] Step 7: Present with caveats
```

## Step 1: Recall Risk Tolerance

ALWAYS call `memory_search` first. The user expects you to know their:
- Total portfolio size (N)
- Max risk per trade (% of N)
- Max portfolio drawdown tolerance
- Existing concentrated positions (so you don't add a correlated name)

If the user has no risk profile on file, ASK before sizing. Do not assume. A common risk budget for a single position is 1-2% of total capital at risk; 0.5% is conservative; 5% is aggressive.

## Step 2: Pull Volatility

- For US equities: call `get_market_data` for `"[TICKER] 1-year daily prices"`, compute daily returns, take the standard deviation × √252 to annualize.
- For crypto: use 30-day or 60-day vol (annualized). Crypto vol is ~2-4x equity vol; adjust accordingly.
- For ETFs: vol is typically 10-20% annualized.
- If you don't have data, use a sector default and flag it.

Output: `σ_annual` (e.g., 0.35 = 35% annualized vol).

## Step 3: Stated Edge

The user must supply a probability that the trade works. Common inputs:
- "I'm 60% confident this is a 30% upside over 12 months"
- "I think there's a 70% chance of a 20% gain and 30% chance of a 15% loss"
- "I think fair value is $200, current is $160, so 25% upside, but only 50% confident"

If the user doesn't supply this, use the reverse-DCF output as a proxy. If neither, ASK.

Convert to **expected value per unit of risk**:
- `EV = P × upside - (1 - P) × downside`
- `EV/risk = EV / max(upside, downside)`

The cleaner version: `edge = (P × upside) - ((1 - P) × downside)`. If `edge < 0`, do not take the trade regardless of size.

## Step 4: Choose a Sizing Method

Three options, in increasing aggressiveness:

### a) Vol-targeted (passive)
- `size = risk_budget_usd / (σ_annual × stop_distance)`
- `stop_distance` is the % drop at which you'd cut the trade (e.g., 0.10 for 10% stop)
- Good for systematic / factor strategies

### b) Kelly criterion (theoretical optimum)
- `f* = (P × b - q) / b` where `b = upside/downside`, `q = 1 - P`
- In practice, use **half-Kelly** (`f* / 2`) to reduce variance and avoid ruin
- Best when you have a clean probability estimate

### c) Fixed-fractional
- `size = risk_budget_usd / stop_distance`
- Simplest, works for any setup, no probability needed
- Most robust for discretionary trades

Default to **(c)** unless the user has a strong probability estimate. If they do, use **half-Kelly (b)**.

## Step 5: Compute the Size

Worked example: user has $100k portfolio, 1% risk budget = $1,000 max loss.

AAPL at $200, you set a $180 stop (10% stop). Vol is 25% annualized.
- `stop_distance = (200 - 180) / 200 = 0.10`
- `size_shares = $1,000 / (0.10 × $200) = 50 shares = $10,000 position`
- Position is 10% of portfolio (normal for a high-conviction diversified name)

Compare to: half-Kelly with P=0.6, upside=30%, downside=15%.
- `b = 30/15 = 2`, `f* = (0.6 × 2 - 0.4) / 2 = 0.4` → use 0.2 (half-Kelly)
- `size = 0.2 × $100k = $20,000` position
- Larger than the vol-targeted size — that's the user's call to make

## Step 6: Sanity Check

Three checks:
- **Concentration**: no single position > 25% of portfolio (default). If exceeded, flag it.
- **Correlation**: don't add a name with ρ > 0.6 to an existing position. Use `get_market_data` to pull 1y history of both and compute.
- **Sector cap**: < 40% of portfolio in any one sector (default).

## Step 7: Present With Caveats

Output format:

```
Suggested size for [TICKER]:
- Method: [vol-targeted / half-Kelly / fixed-fractional]
- Position size: $[X], [Y]% of portfolio
- Risk if stopped out: $[Z], [W]% of portfolio
- Position is [in-line with / above / below] your 1% risk budget
- Caveat: [one specific risk — e.g., "stop is tight; vol suggests wider stops in this name"]
```

End with: `Always confirm the size before placing the order. Sizing is the user's call, not the model's.`

## Notes

- This skill computes sizes for a SINGLE new position. For rebalancing an existing book, the math is different (consider correlation, marginal risk contribution, drawdown-attribution).
- If the user has a hard portfolio drawdown limit (e.g., "20% max drawdown"), Monte Carlo the trade: simulate 1000 paths of the asset using its vol and drift, count the fraction of paths that breach 20% portfolio DD when adding the new position. Flag if > 5%.
- For options, size on the underlying delta-weighted exposure, not the contract notional.