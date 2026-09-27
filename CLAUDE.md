@AGENTS.md

# Product rules (Fivehundrd)

These hold for every change, whoever asks for it; raise it before building anything that breaks one.

- **Provenance, not competition.** Retention shows a visitor their own history as context
  ("Called 3rd", "Found at 23 · now 1,284"), never status. No scores, taste ratings, levels,
  badges, streaks, win counts, percentiles of people, leaderboards or public counts of calls.
  Calls and personal history are private to the visitor and never feed anything public
  (not the Hotspot score, not a counter). See docs/retention.md.
- **Discovery first, no front row.** Every visitor starts somewhere else on the wall; no
  single editorial pick for everyone, no paid boost, no infinite feed.
- **Real numbers only.** Nothing public shows a made-up or placeholder number, date, name,
  address or company fact. Small samples get no percentages.
- **Hotspot weights are a hypothesis.** They live in `private.hotspot_cfg()` and are tuned
  from real data, not presented as proven.
- **The UI is frozen unless a change is approved.** Approved changes go in
  `app/wall/overrides.css` and get their own approved screenshots; the rest of the wall
  stays pixel-identical to `reference.html`.
