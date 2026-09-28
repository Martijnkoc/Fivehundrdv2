@AGENTS.md

# Product rules (Fivehundrd)

These hold for every change, whoever asks for it; raise it before building anything that breaks one.

- **Reputation for taste, never competition.** (Replaces "provenance, not competition",
  2026-09-28, by Martijn.) Signed-in visitors are Scouts: their Timehearts are calls with a
  snapshot frozen at that moment, and proven early calls earn a private percentile and a tier
  (Gold top 3%, Silver 10%, Bronze 25%), shown only to them and shared only by their own
  explicit action. No leaderboards, no rankings of people, no "#1 Scout", no public lists,
  no raw scores, no points, XP or streaks. Tiers and percentiles only exist above a minimum
  population of real eligible Scouts; below it nobody gets one. Scout history never feeds
  the Hotspot score. See docs/scout.md.
- **Discovery first, no front row.** Every visitor starts somewhere else on the wall; no
  single editorial pick for everyone, no paid boost, no infinite feed.
- **Real numbers only.** Nothing public shows a made-up or placeholder number, date, name,
  address or company fact. Small samples get no percentages.
- **Hotspot weights are a hypothesis.** They live in `private.hotspot_cfg()` and are tuned
  from real data, not presented as proven.
- **The UI is frozen unless a change is approved.** Approved changes go in
  `app/wall/overrides.css` and get their own approved screenshots; the rest of the wall
  stays pixel-identical to `reference.html`.
