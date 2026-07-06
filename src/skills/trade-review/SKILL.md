---
name: trade-review
description: Reviews closed trades in the portfolio to extract lessons — what worked, what didn't, and how the user's process can improve. Triggers when the user asks for "trade review", "what did I learn", "review my trades", "post-mortem", "lessons from my book", or after a losing streak.
---

# Trade Review Skill

The most-overlooked part of trading. Closed trades are the only ground truth — everything else is narrative. This skill walks the user's closed positions, computes per-trade stats, and extracts the lessons that compound over time.

## Workflow Checklist

```
Trade Review Progress:
- [ ] Step 1: Read portfolio_view (closed positions + journal entries)
- [ ] Step 2: Bucket trades by direction (long vs short) and by thesis type
- [ ] Step 3: Compute summary stats (hit rate, avg win, avg loss, expectancy)
- [ ] Step 4: Identify the best 3 and worst 3 trades
- [ ] Step 5: Look for patterns (sector concentration, holding-period bias, common loss causes)
- [ ] Step 6: Extract 3-5 actionable lessons
- [ ] Step 7: Update portfolio journal with the lessons (or memory long-term)
```

## Step 1: Pull the Data

Call `portfolio_view`. Read both the `closed` array AND the `journal` array — lessons written at trade time are often the most useful, because the user's reasoning was fresh.

If the user has < 5 closed trades, do NOT run a statistical analysis. Just walk each one and ask what worked.

## Step 2: Bucket the Trades

Two useful cuts:
- **Direction**: long vs short (most users are long-biased; a short book that's losing tells a different story from a long book that's losing)
- **Thesis type**: categorize by the one-word thesis (e.g., "value", "growth", "macro", "event-driven", "special-situations"). Use the thesis field on each closed position.

For a one-time review, keep this light — just write the buckets to the response.

## Step 3: Summary Stats

Compute:
- **Hit rate**: % of trades with positive realized P&L
- **Average win**: mean of positive-realized-PnL trades
- **Average loss**: mean of negative-realized-PnL trades (use absolute value)
- **Largest win / loss**: keep them — they'll show up in Step 4
- **Expectancy per trade**: `(hit_rate × avg_win) - ((1 - hit_rate) × avg_loss)`
- **Profit factor**: `sum(wins) / sum(|losses|)`
- **Average holding period**: in days, from `opened` to `closed`

Render as a small table. If the user has 5+ trades, also break it down by thesis-type bucket.

## Step 4: Best 3 and Worst 3

Pull the top 3 by realized P&L (in absolute or % terms) and bottom 3. For each, in 2 sentences:
- What was the thesis?
- Why did it work / fail?

Don't be polite. If the worst trades were driven by recency bias or stop-loss avoidance, say so.

## Step 5: Pattern Hunt

Three patterns to look for:

1. **Concentration in losers**: are losing trades concentrated in one sector / one factor / one size bucket? (e.g., "All 4 losers were small-cap biotech; all 3 winners were mega-cap tech.")
2. **Holding-period bias**: are winners held longer than losers? (Symptom of cutting winners short and letting losers run.) Compute median holding period for wins vs losses.
3. **Stop-loss discipline**: of the losing trades, how many had a stated stop_loss that was actually triggered vs breached-and-held? Low stop-loss discipline is the single most common retail-trader failure.

State each pattern with specific numbers. "You have a tendency to cut winners early" is useless. "Your median winner is held 12 days, median loser is held 38 days" is useful.

## Step 6: Lessons

3-5 actionable lessons. Format each as:
- **Lesson** (1 sentence): the pattern
- **Action** (1 sentence): what to do differently
- **Evidence** (1 sentence): the data behind it

Examples:
- **Lesson**: Your losers run ~3x longer than your winners.
- **Action**: Set hard stops at entry; tighten if a position drops 10% in 5 days.
- **Evidence**: Median winner holding period is 12 days; median loser is 38 days.

## Step 7: Persist

Call `portfolio_journal` with the top 2-3 lessons (or `memory_update` for the durable stuff). Date-stamp them so the next review can find them.

Also: append a date-stamped entry to `MEMORY.md` (long-term memory) with a one-line summary like "User has 14 closed trades, 64% hit rate, +18% profit factor, but holds losers 3x longer than winners — flag this on next recommendation."

## Notes

- **Survivorship bias**: closed trades only include what the user actually closed. If they have many open positions that are deep underwater and not closed, the book looks better than it is. Surface this as a caveat if relevant.
- **Insufficient sample**: <10 trades, the "patterns" are noise. Don't pretend they aren't. Be explicit: "With only 8 closed trades, this is anecdote not data. Repeat the review at 20 trades."
- **The lessons compound**: the value isn't the first review, it's the third one. Set the expectation that the user re-runs this every quarter.