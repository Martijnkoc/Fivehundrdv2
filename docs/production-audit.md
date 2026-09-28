# Fivehundrd: production audit (SEO/GEO, public information, technical)

Date: 2026-09-26. Scope: everything except Stripe. **DO NOT TOUCH STRIPE YET** (see the end).

## 1. SEO and GEO: what was checked and what changed

No UI, layout, copy in core flows or behaviour was changed. Everything below is
metadata, structured data, server-rendered head content, routes for machines, or
the visually hidden `h1` that the wall page already had.

| Area | Found | Now |
|---|---|---|
| Titles, descriptions | Home had a generic title; stories had a spot-number description | Home: positioning ("a discovery platform…") in description/OG; each discovery: its own title and a description from its pitch, lane and number, and for ended ones the date its 72 hours ended |
| Canonicals | Spot-number addresses (`/s/music/217`) inherited the home canonical | Discovery canonical is the story's lasting link; spot-number addresses are `noindex` and point to the story; lanes, info pages, home each have their own |
| Robots | `robots.txt` ok | Also `X-Robots-Tag: noindex` on `/founder`, `/admin`, `/api/*`; test/demo/checkout-return query URLs disallowed |
| Sitemap | Only live stories | Sitemap **index** (`/sitemap.xml`) → `/sitemaps/pages.xml` + `/sitemaps/discoveries-{n}.xml` (50,000 each), every indexable discovery live or ended, from `stories_indexable()` in the database; never unpaid, hidden or removed stories, `/founder`, `/admin`, APIs, spot-number or test URLs |
| Structured data | Organization, WebSite, Service, FAQPage, breadcrumbs on info pages | Plus WebPage (home), DefinedTermSet (The Wall, Spot, Discovery, Finds, Create), CollectionPage + breadcrumbs (lanes), CreativeWork + breadcrumbs per discovery (name, pitch, lane, image, dates, the maker's own links). No ratings, reviews or invented attributes |
| Headings | Hidden `h1` "The wall" everywhere | Same hidden `h1`, now naming the page: the wall, the lane, or the discovery |
| Social previews | Stories had a drawn preview; the site had none | Site-wide preview image (home, lanes, info pages); discoveries keep theirs (artwork, name, lane, number, lasting link) with `og:url` = canonical |
| Durable pages | Live → the wall opened on the story; ended → a page saying its 72 hours are over; hidden/removed/unpaid → 404 | Unchanged behaviour; verified in tests. A number that changes hands never takes over the old story's URL: the code in the URL decides |
| 404s | Global 404 returns status 404 | Verified: unknown pages, unknown story codes and unknown lanes return 404 |
| GEO | `llms.txt` with facts | Also explains The Wall, Spot, Discovery, Finds, Create and what happens after 72 hours |
| Performance | – | Home stays static; JSON-LD is a few hundred bytes of server HTML; no client SEO code, no extra hydration |

What machines can now read from the HTML: what Fivehundrd is, how The Wall works,
72-hour placements, the six lanes, how makers get on it, what visitors do, what
happens after a spot ends.

## 2. Footer and public information

Every footer link goes to a real page (tested). Corrections made to content that
wasn't true:

- **Contact address**: `hello@fivehundrd.com` was a made-up default. Removed; it
  appears only when `NEXT_PUBLIC_CONTACT_EMAIL` is set.
- **Reminder emails**: the info pages promised "a reminder an hour before a saved
  spot ends". Nothing sends those. Removed from the info pages. The Keep my card
  sheet in the (frozen) UI still offers it: see P0.
- **IP addresses**: the privacy page said a hash was "used briefly". It is stored
  with events, reports, uploads and purchases. Corrected; local storage and
  cookies now described.

Consistent and correct: 6 lanes, 500 spots per lane, 72 hours, no algorithm,
checks before payment, three reports or one child-safety report hide a story,
at most three held spots per person, automatic refund when a paid spot can't go
live. **Price**: $9.95 appears in `lib/wall/model.ts`, `app/api/checkout/route.ts`
(995 cents), the moderation prompt and `lib/site/facts.ts`. All the same today;
four copies of one number (P3).

**Founder input required**: legal entity name, address, chamber of commerce and
VAT number (not in the repo); a real contact/support address; social accounts (none
exist in the repo); legal review of Terms and Privacy.

## 3. Technical audit

Measured: home page 38 KB HTML (gzip), 196 KB JavaScript (gzip, of which React
~73 KB); `/` is static; `/api/wall` is cached at the edge for 15 s.

### P0: before public beta

| Problem | What people notice | Risk | Fix | Size |
|---|---|---|---|---|
| Analytics uses a persistent visitor id in local storage and records visits and impressions without consent | Nothing | EU ePrivacy/GDPR: non-essential tracking needs consent; fines, trust | Founder/legal decision: a consent step (UI change) or consent-free measurement (no persistent id; loses return-rate accuracy) | M |
| The Keep my card sheet offers "Remind me an hour before a saved spot ends"; no reminder is ever sent | People wait for reminders that never come | Broken promise in the core flow | Build the reminder job (email provider + cron), or approve a copy change | M |
| Safety checks fail open: without `ANTHROPIC_API_KEY`, `GOOGLE_SAFE_BROWSING_KEY` and Turnstile keys, stories go live unchecked and the robot check is skipped | The Rules page says checks happen | Abuse, and a public claim that isn't true | Set the keys in production; show missing keys as red on Operations | S |
| No legal identity or contact on Terms/Privacy | No one to contact | GDPR requires controller identity and contact | Founder input + lawyer | S |
| Production configuration not verified: server key, Supabase keys, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, four Vercel crons (the Hobby plan allows fewer and only daily) | Broken pages, crons that never run, canonicals to the wrong domain | Indexing and data integrity | Check plan and env; point `fivehundrd.com` at this project or set `NEXT_PUBLIC_SITE_URL` | S |

### P1: before serious traffic

| Problem | What people notice | Risk | Fix | Size |
|---|---|---|---|---|
| `/api/wall` sends every live story with full excerpts (up to 2,500 characters each) and every open tab re-downloads it every minute | Slow wall on phones once the wall fills | Several MB per visitor per minute at 3,000 spots; bandwidth cost | Slim feed without excerpts (load on open), ETag | M |
| Database size: ~2.5 KB of analytics per visitor per day | Nothing, until the database is full | Supabase free tier (500 MB) full in about a month at 10,000 visitors a day | Pro plan; nightly rollups; keep raw rows 90 days | M |
| Story pages query the database on every request; their preview image is re-drawn per crawler | Slower shared links under load | Cost, latency | Cache per story (revalidate ~60 s, invalidate on hide/remove) | S–M |
| `/api/events` has no bot filter (`/api/track` has) | Inflated open/save counts on tiles | Wrong public numbers | Same bot check as `/api/track` | S |
| `scripts/fixture.js` (8.5 KB gzip) loads for every visitor | Slightly slower first load | – | Import it only with `?fixture=1` | S |
| One shared server key guards every database write | Nothing | If it leaks, full write access | Keep it only in Vault and Vercel; write down a rotation procedure | S |
| Moderation "review" and "unscanned" stories go live | Doubtful content visible until reviewed | Safety | Decide: hold until reviewed, or keep | S |

### P2: once traction starts

| Problem | Risk | Fix | Size |
|---|---|---|---|
| Control Room queries (`fd_series`, `fd_spots`, `fd_cohorts`) scan raw rows with per-bucket subqueries | Seconds per page from ~1M rows | Daily rollup tables; cohorts from rollups | M |
| Impressions ~8 rows per visit | ~24M rows a month at 100,000 visits a day | Rollups + retention, monthly partitions | M–L |
| Every open/save is its own request and RPC | Function invocations and DB writes | Batch them in the existing beacon | S–M |
| Artwork is served full size from Storage | Heavy images on phones | Supabase image transforms or an image loader, long cache headers | M |
| 24 indexes unused so far (no traffic yet); 3 foreign keys without an index | Minor | Re-check after launch | S |

### P3: later

- One constant for the price instead of four.
- Teaser leftovers in the database (`early_access_*`, a trigger function): harmless; keep for the data.
- Per-story `og:image:alt`; a lane-specific schema type (MusicRecording, Book, VideoGame) once makers declare what their work is.
- The per-minute API log row per route becomes a hot row above ~50 requests/second: move to a log drain.

### Scale

| Traffic | What happens |
|---|---|
| 1,000 visitors/day | Everything is fine. ~5,000 writes a day; wall reads come from the edge cache. |
| 10,000/day | Fine after P1: the wall feed size (when the wall is full) and the database plan are the first limits. |
| 1,000,000/month (~33,000/day) | Needs P1 done and nightly rollups (P2) for the Control Room to stay fast. |
| 100,000/day | Needs P2: rollups and retention (raw analytics ~8 GB/month otherwise), cached story pages, batched events. Vercel invocations for beacons become the main cost. |

Already done right: static home page, edge-cached wall feed, anonymous analytics
with a daily/visit cap per visitor, all writes through server-key RPCs, signed
founder sessions, webhook signature checks, idempotent payment completion,
stale reservations released every minute (pg_cron), daily cleanup of unpaid
uploads, durable story links that survive their spot.

## DO NOT TOUCH STRIPE YET

Stripe is the final production step after:

1. SEO/GEO is correct;
2. public/footer information is correct;
3. production optimization audit is complete;
4. Supabase/data integrity is validated;
5. deployment/environment configuration is validated.

Until then, inspect Stripe-related code only when needed for the audit. Do not change products, prices, checkout logic, webhooks or payment configuration.
