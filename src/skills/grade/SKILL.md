---
name: grade-investment
description: End-to-end investment grade for a single ticker — a 0-100 score on a 1-3 year horizon and a 20+ year horizon, with the full factor breakdown, valuation work, risks and a verdict. Triggers when the user asks "is X a good investment", "should I buy X", "rate X", "grade X", "score X", "analyse X", "what do you think of X", "X short term or long term", or names a ticker and asks for an opinion.
---

# Investment Grade Skill

Produces the complete assessment of one company: what the numbers say, what the
score is, and what would change it. The grade itself is arithmetic — `grade_ticker`
computes it from fixed weights so the same inputs always give the same number.
Your job is the analysis around it, not the number.

## Workflow Checklist

Copy and track progress:

```
Grade Progress:
- [ ] Step 1: Score it
- [ ] Step 2: Read the factor breakdown
- [ ] Step 3: Fill the gaps the score cannot see
- [ ] Step 4: Sanity-check against valuation
- [ ] Step 5: Deliver both horizons
```

## Step 1: Score it

Call `grade_ticker` with the ticker. One call returns both horizons, every factor
sub-score with the raw numbers behind it, and the coverage percentage.

Do this FIRST, before any other research. It is two API calls and it hands you
20+ years of ROIC, margin history, valuation percentile and drawdown behaviour in
one result — most of what the other tools would take a dozen calls to assemble.

## Non-US tickers

Fundamental grading covers **US-listed securities only** on the current data plan.
`grade_ticker` handles this for you rather than failing blindly:

- A cross-listed name resolves to its US line automatically (`SAP.DE` -> `SAP`,
  `ASML.AS` -> `ASML`). The result carries `gradedAs` and a `listingNote` —
  **quote that note to the user**, because the multiples are the US-listed ones.
- A name with no US line (`PETR4.SA`, `0700.HK`) returns an error naming the ADR
  to try instead. Grade the ADR, and say that is what you did.
- For price, market cap and trading data on the local line, `get_global_stock`
  covers ~65 exchanges including all of Europe, most of Asia, South America and
  Africa. It just cannot produce a grade.
- No provider here reaches Japan, India, Singapore, Israel, Saudi Arabia, Turkey,
  Russia or the Caucasus. Say so plainly rather than improvising from web search
  and presenting it as equivalent.

## Step 2: Read the factor breakdown

The factors are already sorted by contribution. For each horizon identify:

- the two or three factors that **carried** the score
- the two or three that **dragged** it
- anything in `missing` — a factor with no data is excluded and costs coverage

**Coverage below 60% means the grade is thin.** Say so explicitly rather than
quoting the number as if it were solid.

## Step 3: Fill the gaps the score cannot see

The engine is deliberately quantitative. It knows nothing about:

- pending litigation, regulatory action, or a live accounting question
- customer concentration, key-person risk, a founder leaving
- a product cycle, a patent cliff, a contract renewal
- anything that happened since the last reported fiscal year

Use `get_company_news`, `read_filings` (risk factors), and `web_search` to cover
these. If something you find would move the thesis, say which factor it
contradicts and by how much you would discount the score.

## Step 4: Sanity-check against valuation

The grade measures business quality and relative cheapness, **not** intrinsic
value. A 90 on a company trading at 60x earnings is still a bad entry price.

- For a compounder, run the `dcf-valuation` skill or `reverse-dcf` to see what
  growth the price already assumes.
- For an income name, use `ddm-valuation`.
- If the score and the valuation disagree, that disagreement IS the finding.

## Step 5: Deliver both horizons

Always give both, and be explicit that they answer different questions.

```
[TICKER] — [company name]

SHORT TERM (1-3 years): [score]/100 — [verdict]
[Two or three sentences. Lead with the factors that drove it. Name the catalyst
or the thing that would break it.]

LONG TERM (20+ years): [score]/100 — [verdict]
[Two or three sentences. Lead with return-on-capital durability and
survivability. Say whether the moat is widening or eroding, with the margin
trend as evidence.]

What drove the scores
- [factor]: [sub-score] — [the raw number]
- [factor]: [sub-score] — [the raw number]
- [factor]: [sub-score] — [the raw number]

What the score cannot see
- [qualitative risk from Step 3]

What would change my mind
- [specific, falsifiable trigger]

[Coverage caveat if either horizon is below 60%.]
```

## Rules

- **Never invent or adjust the score.** If you disagree with it, say so and give
  your reasoning next to it. Do not quote a different number.
- Short and long scores diverging is normal and informative — a cheap, shrinking
  business scores well short and badly long. Explain the divergence, do not
  average it away.
- The grade is recorded automatically. If the user has asked before, call
  `score_history` and lead with what changed since.
- For a position the user actually holds, follow with `position-sizing`.
- For a full write-up, follow with `write-memo` — the grade gives it its spine.
