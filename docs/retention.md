# Retention: Discover → Keep → Return → See what changed

Approved 2026-09-27. Three visible layers; everything else is data.

1. **Above the wall** (`app/wall/Spotlight.tsx`): the since line gets one personal item,
   by priority: something you called became a Hotspot → a Find ends within 6h → Finds
   gaining saves (≥ max(5, 50%) since your last visit) → a maker you found is back.
   10% of live visitors (fixed by visitor id) don't see it: the control group.
2. **Call it** on an opened spot (`app/wall/Cover.tsx`): after Next spot; one inline
   question; also saves. Shows which caller you were ("Called 3rd · Sep 27"), derived
   from the order of calls and shown only to you. Three a day (UTC). Not on current top-5 Hotspots, stories that
   have ever been one, your own spot or ended spots. Private: never shown, never counted
   in Hotspots.
3. **Finds** (`app/wall/Card.tsx`): one line each, by priority: call became a Hotspot
   ("Called 3rd · 14h early") → call moved ("Called at 12 · now 380") → maker is back →
   found early ("Found at 23 · now 1,284") → open call ("Called Sep 27") → ended
   ("Found Sep 27") → "#7 of 340".

## Rule: provenance, not competition

Personal history is context, never status: no scores, levels, badges, streaks, win counts,
leaderboards or public call counts (CLAUDE.md, "Product rules").

## Definitions (thresholds: `private.retention_cfg()`, `private.hotspot_cfg()`)

- **Hotspot score**: per person over 6h, (opens + 3 × link clicks + 4 × saves + 4 × shares)
  / √(exposed + 20), where *exposed* is everyone who saw the tile or did anything with the
  story in those 6 hours; ≥ 3 people; halves every 6h after first reaching the top 5.
  `stories.hot_at` keeps that first moment for good. **The weights are a hypothesis**, set
  by hand before any traffic: after a few thousand real sessions, check which early signal
  best predicts what people keep (saves not undone), click through to and share, and
  change the weights in `private.hotspot_cfg()`.
- **What a call measures**: momentum on Fivehundrd (Hotspot or save growth), not success
  elsewhere on the internet.
- **Found early**: your first save was among the first 10% of the story's savers (by first
  save time) and it reached ≥ 20 savers — while live, only once it has 3× the savers it had
  when you saved — *or* you saved it before it became a Hotspot.
- **Call came true**: the story wasn't a Hotspot when called, and before it ended either
  became one (`hotspot`), or the people who saved it after the call reached
  max(15, 2 × the savers before it) (`moved`). Settled when the story ends. Failed calls are
  never mentioned.

## Data

- `calls`: one row per visitor and story (no undo; calling again returns the first call),
  with the story's state frozen at that moment (distinct people who saw, opened, saved,
  shared, clicked; score, rank). Outcome fields are derived by `private.settle_calls()`,
  which runs with Hotspots every 10 minutes.
- `finds_status(visitor, ids)` (`/api/finds`): only stories that visitor saved or called.
  "Maker is back" matches email or paying browser inside the database; nothing about the
  maker leaves it.
- `track` kinds `since_shown` (once a visit, with the item and holdout), `since_tap`,
  `hot_tap`, `new_tap` (`/api/track`, `track_surface`).
- Control Room: Retention → "The retention loop" (`fd_retention`).

## To validate with real traffic

- Hotspot weights (above).
- Found Early at very different sizes: 10% of 21 savers is 2 people, of 25,000 it is 2,500;
  likely percentile plus an absolute cap on rank.
- "Called 40th" reveals that 39 people called before; above some rank, "Called early".
- "Maker is back" matches email or paying browser; a real maker account is the long-term fix.

## Not now

- One Thing Worth Finding Today: a single pick for everyone is a front row.
- Blind Find: hides the work makers paid to show.
- Reminder email: the strongest D3/D7 lever; needs an email provider.
