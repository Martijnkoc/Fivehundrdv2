# Scout: reputation for taste

Approved 2026-09-28. It replaces "provenance, not competition" (CLAUDE.md) and Call it
(docs/retention.md).

**Fivehundrd remembers what you found early.** A signed-in visitor is a Scout. Their
Timehearts are calls. Calls that prove themselves earn a private percentile and a tier,
which the Scout can share by their own action.

There is no leaderboard, no ranking of people, no raw score, no points, XP or streaks.

## Words

| Word | Meaning |
|---|---|
| Timeheart | The action. It keeps a discovery and, for a signed-in visitor, makes a call. |
| Kept | The completed state. |
| Scout | The person: a signed-in visitor with at least one call. |
| Scouts | Their history: the list that replaced Finds. |
| Scout Card | The former Fivehundrd card. Private, shareable by explicit action. |
| Early Call | A call the data proves was early (below). |

## What's recorded

`scout_calls` holds one row per account and story, and one per browser and story. The first
Timeheart stands: keeping it again doesn't make a new call, and letting go hides it without
removing it from the record.

The snapshot is taken on the server at the moment of the Timeheart, and a trigger stops it
from ever changing:
- keepers before you, and your position
- people who had opened it, and people exposed to it
- whether it was already a Hotspot, and its Hotspot rank
- the story's age

`source` says how the call was made:
- **`signed_in`:** made while signed in. It can count toward the Scout's standing.
- **`anonymous`:** made by a browser that isn't signed in. It is history only.
- **`migrated`:** made before signing in, and now the account's history. It never counts.

## Definitions (thresholds in `private.scout_cfg()`, the same in `lib/wall/scout.ts`)

- **Breakout.** The story became a Hotspot after your call (`hotspot`), or it reached
  25 keepers and 3× your position (`grew`). Seen while the story is live.
- **Early Call.** It must meet all three, judged when the story's 72 hours end:
  1. it wasn't a Hotspot when you kept it,
  2. you are within the first 20% of its final keepers,
  3. it broke out.
- **Call value.** An Early Call is worth `(1 − (position − 1) / final) × min(6, log2(1 + final / max(1, keepers before))) × 1.5 if it became a Hotspot`. Any other call is worth 0.
- **Reputation.** `Σ value × (early + 1) / (settled + 5)`, over settled calls that count. The
  second factor is a smoothed hit rate: keeping everything dilutes it.
- **Eligible.** All of: at least 10 settled calls that count, a Scout for at least 7 days,
  and not flagged for multiple accounts.
- **Percentile and tier.** `higher` is the number of eligible Scouts with a strictly higher
  score, so ties share the better place.
  - Gold if `higher + 1 ≤ floor(3% × N)`; Silver at 10%; Bronze at 25%.
  - A tier needs at least one Early Call.
  - "Top X%" is `ceil((higher + 1) / N × 100)` and is shown only with a tier.
- **Minimum population.** Tiers and percentiles exist only with **200 eligible Scouts**
  (Gold is then at least 6 people). Below that, a Scout sees "Building your Scout history"
  (fewer than 10 settled calls) or "Scout".
- **Recalculated nightly** (`/api/cron/scout`). Tier changes go to `scout_moves` for the
  moment on the card.

## Anti-gaming

A call doesn't count toward reputation (`scored = false`, with flags) when any of these hold:

- it was made without being signed in, or before signing in;
- it is on your own story (the browser that paid, or your account's email as the maker's);
- you kept it without opening it (`no_open`);
- it is over 20 counted calls in a UTC day (`daily_cap`);
- it is the 11th or later call within a minute (`burst`).

The one exception to the first rule: the Timeheart that led to signing in, made within the
last 30 minutes on a live story, counts as if made signed in, with the same checks.

Multiple accounts, meaning a browser used by two accounts, or more than 3 accounts on one
IP hash within 30 days, make those accounts ineligible for a percentile. They keep their
history.

None of this is visible in the interface.

## Signing in

`scout_attach(user, visitor, story)` runs on every signed-in load:

- **Saves:** this browser's saves become the account's.
- **Calls:** this browser's calls become the account's history, as `migrated`, except the
  one above.
- **Older saves:** saves from before calls existed get a history row reconstructed from the
  event log (server times only), flagged `reconstructed`, and never counted.
- **Duplicates:** the account's own call always wins over a browser's duplicate.

## Sharing

- **The card.** `scout_share` sets a display name (never the email) and a random link that
  the Scout can replace or switch off. `scout_public(slug)` returns only what the card shows,
  and nothing while sharing is off.
- **A single call.** `scout_call_public(slug, story)` works only for an Early Call.

## Metrics (`track`, Control Room: `fd_scout`)

The events recorded are `scout_prompt_shown`, `scout_prompt_tap`, `scout_signed_in`,
`scout_card_view`, `scout_card_share`, `scout_call_share`, `scout_move_seen` and
`scout_breakout_seen`.

`fd_scout` reports new Scouts, calls, Early Calls, and D1/D7/D30 return for Scouts
against other visitors. Behaviour only: no profiling.

## To validate with real traffic

- **Early Call thresholds.** 20% of a story's keepers, 25 keepers and 3× growth. At small
  sizes a few people decide it.
- **The minimum population (200).** It is a guess at "big enough that the top 3% means
  something".
- **The multi-account rule.** It will catch shared households.
