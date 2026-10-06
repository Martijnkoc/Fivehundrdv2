# Copy: what Fivehundrd says, and why it's true

The words live in one module, `lib/site/copy.ts`. The wall, the Scout Card,
Create and the site read their headlines, calls to action and empty states
from there. Numbers never live in that file: they come from the database, or
they aren't shown.

## Positioning

- **Line:** Find what’s next. Before everyone else does.
- **Support:** 500 spots. 72 hours. New music, creators, books, games and ideas.
- **Brand:** Fivehundrd is where the internet discovers what’s next.
- **Creator:** Put your work where people come to discover.
- **Scout:** Your taste. With receipts.
- **Loops:** visitors *Find. Scout. Come back.* · makers *Place. Get found. Grow.*

## The first screen (`app/wall/Hero.tsx`)

This is the one-line promise and what's on the Wall, today's numbers (with
"Claim a spot" for makers), and the loop in three steps: Discover, Scout,
Come back. There are no separate buttons under the promise, so the first
screen stays short and the Wall shows sooner. The Wall itself is the way in.

The first screen is only shown on a first visit. Once a visitor has scouted
something (`fh-intro`) or signed in (`fh-account`), an inline script adds
`.fh-back` to `<html>` before the first paint. The wall then starts right
under the header, so nothing jumps.

**Today on Fivehundrd** (`public.today_public()`, `/api/today`, cached for 30
seconds and refreshed every 45 seconds while the tab is visible) shows two
numbers:

- **Visitors:** distinct browsers that visited today (UTC). Bots are never
  recorded. It counts browsers, not people.
- **Discoveries opened:** opens today, each counted once per visitor, story and
  day.

Neither number is a promise of reach. If the numbers are unavailable (no
database, or an error), the box shows only the line and the creator call to
action, with no heading that promises numbers. The box is not a live region.

## Vocabulary

Wall · Spot · Discovery · Scout it (the action) · Scouted (its done state) ·
Scout (the person, and the verb) · Scouts (your list) · Scout Card · Early
Call · Hotspot · Open Spot.

Never use: likes, favorites, bookmarks, saved, finds, My Finds, posts,
listings, campaigns, trending. The header's call to action is "Claim a spot",
and the phone tab says "Claim".

## Truthfulness rules the copy follows

- **Step 3** says "Signed in". A scouted story is kept on the device
  without an account, but earliness is only proven for signed-in calls.
- **"You called it early."** is only said once a call is settled
  (`settledAt`, an Early Call). A breakout while the story is still live says
  "Something you Scouted is taking off."
- **Positions** ("#14") count everyone who kept the story, including people
  without an account. They are never a count of Scouts.
- **Tier promotion** ("Your eye is getting sharper. You’re now a Silver
  Scout. Top 10% of Fivehundrd Scouts.") appears once, on the visit after the
  move. The tier name is always written out, so colour is never the only
  signal.
- **Your Wall Today** only shows lines that are true today:
  - new spots since your last visit
  - Scouts that gained scouts while you were away
  - Scouts that end within 6 hours

  When there's nothing to say, the section is left out.
- **Create** makes no reach promise. It says "There’s no front row: every
  visitor starts somewhere else on the Wall." It no longer says that every
  spot gets its turn at the top, because Hotspots need real traction.
- **A maker's numbers** are in people ("41 people thought this was worth
  remembering."), never a rank.

## Measured calls to action

The track kinds are defined in `supabase/migrations/…_copy.sql`. The kinds
`hero_explore_wall_clicked` and `hero_creator_cta_clicked` are still allowed
there, but nothing sends them now that the hero buttons are gone.

- `live_proof_creator_cta_clicked`
- `scout_explainer_cta_clicked`
- `open_spot_clicked`
- `creator_place_clicked`

The Scout ones already existed:

| Brief's name | Existing kind |
| --- | --- |
| `scout_auth_prompt_shown` | `scout_prompt_shown` |
| `scout_auth_completed` | `scout_signed_in` |
| `scout_card_shared` | `scout_card_share` |
