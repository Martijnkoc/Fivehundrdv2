@AGENTS.md

# Product rules (Fivehundrd)

These hold for every change, whoever asks for it; raise it before building anything that breaks one.

- **Reputation for taste, never competition.** (Replaces "provenance, not competition",
  2026-09-28, by Martijn.) Signed-in visitors are Scouts: each thing they scout ("Scout it", formerly Timeheart) is a call
  with a snapshot frozen at that moment, and proven early calls earn a private percentile and a tier
  (Gold top 3%, Silver 10%, Bronze 25%), shown only to them and shared only by their own
  explicit action. No leaderboards, no rankings of people, no "#1 Scout", no public lists,
  no raw scores, no points, XP or streaks. Tiers and percentiles only exist above a minimum
  population of real eligible Scouts; below it nobody gets one. Scout history never feeds
  the Hotspot score. See docs/scout.md.
- **Discovery first, no front row.** Every visitor starts somewhere else on the wall; no
  single editorial pick for everyone, no paid boost, no infinite feed.
- **Real numbers only.** Nothing public shows a made-up or placeholder number, date, name,
  address or company fact. Small samples get no percentages.
- **Prices are always in US dollars.** (2026-10-03, by Martijn.) A spot's price, checkout
  currency and every public mention of it are in USD, never euros or a local currency.
  VAT is settled when payments switch on (`NEXT_PUBLIC_PAYMENTS=on`).
- **Hotspot weights are a hypothesis.** They live in `private.hotspot_cfg()` and are tuned
  from real data, not presented as proven.
- **The UI is frozen unless a change is approved.** Approved changes go in
  `app/wall/overrides/` and get their own approved screenshots; the rest of the wall
  stays pixel-identical to `reference.html`.
