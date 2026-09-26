# Fivehundrd. The Wall

Production port of the approved `reference.html` prototype.

## Local development

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The prepare script builds the served copy of
the approved prototype in `.generated/` (not public). `reference.html` itself
stays untouched. The copy differs from it in two ways:

- Inter and Fraunces are self-hosted from `public/fonts/` (copied from the
  `@fontsource-variable` packages) instead of loaded from Google Fonts.
- A fixture bootstrap (`scripts/fixture.js`) is inlined. With `?fixture=1` it
  freezes the clock at `2026-09-24T12:00:00Z` and seeds `Math.random`, so the
  ring entry point and "Create your story" numbers are identical on every run.

## Porting status

`/` is a Next.js page (`app/page.tsx`). The prototype has been fully moved
into typed modules and React components; no prototype script remains. The
visual suite must still match the reference after every change.

| Part | Where it lives |
|---|---|
| CSS | `app/wall/wall.css`, copied verbatim from `reference.html` and inlined as-is (not through the CSS pipeline, which rewrites values) |
| Demo data, lanes, time, artwork, icons, links, images, social card | `lib/wall/*` (typed) |
| Wall order: lanes, search, ring, rows | `lib/wall/rack.ts` |
| Header, footer, tab bar, overlays | `app/wall/Chrome.tsx` |
| Lane tabs, tiles, inline panel | `app/wall/LaneNav.tsx`, `Rack.tsx`, `Tile.tsx` |
| Open spot (panel and phone sheet), per-lane blocks | `app/wall/Cover.tsx`, `SheetContent.tsx` |
| Fivehundrd card, saves, My card badge | `app/wall/Card.tsx`, `lib/wall/saves.ts` |
| Share sheet, Keep my card, toast | `app/wall/Sheets.tsx` |
| Create your story, success screen | `app/wall/Claim.tsx` |
| Preview player and demo synth | `app/wall/audio.ts` |
| Behaviour: glide, open/close, sheet ghost/drag/back, fly-to-card, tab bar, claims, minute tick | `app/wall/controller.ts` |

The controller decides what happens and hands React the state through
`app/wall/store.ts`; React renders it synchronously, so the controller can
measure and animate the new DOM straight away, as the reference did.

## Approved changes on top of the reference

The reference wins where it and the brief disagree, except for these changes,
which were signed off:

1. The open spot's countdown ticks every second (§6). The reference's stood still.
2. Closing the phone sheet leaves you exactly where you were on the wall (§7).
3. Rotating keeps the open spot open both ways: sheet to inline panel, and inline panel to sheet (§7, "and vice versa").
4. The index strip is removed. The reference only hid it, and it took no space.
5. Keep my card shows the official Google and Apple marks (§12).
6. On phones, Keep my card closes the card first, so the login sheet opens in front of it. In the reference it opened behind the card.
7. Art direction: a lighter warm off-white page, warm paper spot cards that lift off it, washed charcoal instead of screen black (the Create button most of all), and subtle grain and halftone on cards and artwork. Layout, sizes, spacing and hierarchy are unchanged.
8. On phones an open spot is an overlay above the wall that grows out of its tile and shrinks back into it, with room around it to tap to close. The wall never moves behind it; ×, a tap outside, Escape, a downward drag and the back gesture all close it.
9. One spot everywhere: the Create preview shows the wall's own tile (`SpotTile`, the same component and styles as the wall) above the opened view.
10. Share cards are built around that same tile, in Story (1080×1920), Square (1080×1080) and Wide (1200×630), and replace the reference's hand-drawn canvas card on the Done screen. Share goes straight to the native share sheet with the card and link where the phone can share files; otherwise the share sheet offers the card, save, copy image, copy link and "For Instagram & TikTok".
11. Screens redesigned by these changes (Create, the Done screen, the share sheet) are compared against approved baselines of the app itself (`tests/__baselines__/…/approved/`, committed; `pnpm test:approve` rewrites them after a signed-off change), still at zero tolerance.
12. Mobile audit (phones and tablets): Back closes whatever is open (a spot, Finds, Create, Share, Report, Keep my card), top one first; sheets open above the tab bar and above an open spot; the tab bar reads **Wall / Finds / Create**; a compact phone header (brand and a search button, lanes with 44px tabs); every control at least 44px; a one-line introduction on a first visit; Create in six steps (lane, artwork, name, description, links, preview and pay) with the wall's own tile filling in beside each question.
13. Phone performance: rows out of view skip layout and paint (`content-visibility`), tile patterns are images instead of inline SVG (25k → 11k elements), the wall is built a few rows at a time, the spot overlay animates with transform and opacity only, and phones use tints instead of blur and blend modes. All phone and tablet screenshots are approved baselines; desktop still matches the reference pixel for pixel.

CSS for these lives in `app/wall/overrides.css`. The visual suite applies it
to the reference too, so the baselines are "the reference plus the approved
changes". Behaviour tests for them run on the app only, with the reason given.

## Deploying

`vercel.json` pins the framework to Next.js. The Vercel project was created
before the app existed, when it was a plain HTML repository, so it would
otherwise build with the "Other" preset and serve only `public/`, which gives
a 404 on `/`.

## Database

Supabase (Postgres, Auth, Storage, Cron). The schema is
`supabase/migrations/`: 500 spots per lane keyed by `(lane, no)`, stories,
saves, events, and the functions the app calls (`wall_public`, checkout,
webhook, events). Visitors can only read the public wall; everything that
changes it goes through the server, which proves itself with a key kept in
Supabase Vault. The live teaser tables (`early_access_signups`,
`early_access_events`) live in the same project and are left untouched.

`pnpm test:db` runs the schema on an in-process Postgres (PGlite) with
Auth, Vault and the API roles stubbed.
`pnpm test:unit` covers the live wall's layout (`lib/wall/live.ts`).

## The live wall

With the Supabase variables set, `/` is the live wall: every live story
first, taking turns lane by lane, then open spots until the wall holds 500.
Without them (and always with `?demo=1` or `?fixture=1`) it is the demo wall
from the reference. A story's address is `/s/{lane}/{no}/{code}`, e.g. `/s/music/217/k3f9x2ab`.
The code belongs to the story, so a shared link keeps working after its 72
hours, when No. 217 has a new holder: while it's live the link opens the wall
at the story; afterwards it shows the story as it was (the same open view,
aged), where to find its maker, and the way to the wall. `/s/{lane}/{no}`
opens whoever holds that number now. Link previews (X, WhatsApp, iMessage)
are drawn on the server as the Wide card, from the same data, colours,
pattern and fonts (`opengraph-image.tsx`), since those platforms can't run
the wall.

| Route | What it does |
| --- | --- |
| `GET /api/wall` | live stories and held numbers, cached 15 s at the edge |
| `POST /api/checkout` | checks the claim, holds the number for 30 minutes, opens Stripe Checkout ($9.95) |
| `GET /api/checkout/status` | where a checkout stands, for the page Stripe returns to |
| `POST /api/checkout/cancel` | the maker backed out: ends the session, frees the number |
| `POST /api/stripe/webhook` | paid → live for 72 hours; expired or failed → number free |
| `POST /api/events` | opens, saves, shares, link clicks, entries |
| `POST /api/uploads` | a one-time upload link for a draft file (15 an hour per person) |
| `POST /api/reports` | a visitor reports a story |
| `GET/POST /api/admin` | the admin screen's data and actions |
| `GET /api/cron/cleanup` | daily: removes draft uploads nobody paid for |

Media is uploaded from the browser to Storage (`art`, `audio`, under
`pending/`) through one-time links the server hands out, before paying. Keep my card uses Supabase Auth: an email link
always; Google and Apple once they are switched on under Authentication →
Providers.

Environment variables (Vercel → Settings → Environment Variables):

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API keys → publishable |
| `FIVEHUNDRD_SERVER_KEY` | the Vault secret `fivehundrd_server_key` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | the webhook endpoint for `/api/stripe/webhook` |

Optional, for keeping the wall safe (each is skipped when unset):

| Variable | What it does |
| --- | --- |
| `SUPABASE_SECRET_KEY` | upload links and the daily clean-up (needed for uploads) |
| `ANTHROPIC_API_KEY` | the automatic check of names, texts and images before payment |
| `GOOGLE_SAFE_BROWSING_KEY` | checks links against Google's list of harmful sites |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare's invisible robot check before paying |
| `ADMIN_EMAILS` | who may open `/admin` (comma separated) |
| `CRON_SECRET` | lets Vercel's daily clean-up in |

The webhook listens for `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.expired` and
`checkout.session.async_payment_failed`.

## Keeping the wall safe

- **Before payment** every story is checked: links against simple rules (no
  short links, bare server addresses or hidden logins) and Google Safe
  Browsing; the name, texts and images by Claude. Clear violations are
  refused before any money moves; doubtful ones go live and wait on the
  admin screen.
- **Reports**: a Report button on every live story. Three people reporting
  it, or one report of a child at risk, takes it off the wall until a person
  looks.
- **Limits**: one person holds at most 3 spots at once and starts at most 10
  checkouts an hour; 15 uploads an hour; an invisible robot check before
  paying. Uploads nobody paid for are removed daily.
- **No spot, no charge**: a payment for a story that was taken off the wall
  (or let go) before it went live is refunded automatically.
- **`/admin`**: live stories, what needs a look, reports, takings per day,
  week and month; hide, keep, remove, refund. Sign in with an email link;
  only `ADMIN_EMAILS` get in.

## Checks

```bash
pnpm lint
pnpm test:db
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:e2e` runs two Playwright projects:

1. `reference` renders `/reference.html?fixture=1` and writes the baselines
   (`pnpm test:baseline`).
2. `app` renders `/?fixture=1` and compares it against them
   (`pnpm test:visual`).

Both run at 390×844, 700×900 and 1400×900, in light and dark mode, for every
state in BUILD_BRIEF §1.3, against the production build. The allowed
difference is 0 pixels. Baselines are regenerated from the reference on each
run and are not committed.

`tests/behaviour.spec.ts` checks what screenshots cannot see (§6, §7, §17):
the sheet's open and close paths (×, backdrop, Escape, back, drag, flick),
Next spot in place, Save, deep links, rotation, the ghost animation and
reduced motion. It runs on both projects, and both must pass.

To use an already installed Chromium instead of Playwright's download, set
`CHROMIUM_PATH=/path/to/chrome`.
