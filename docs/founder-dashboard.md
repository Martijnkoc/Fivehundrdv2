# Fivehundrd Control Room: blueprint

A private product surface at `/founder` (its own root layout, bundle, styles
and sign-in; later `founder.fivehundrd.com` by pointing that host at the same
routes). The public wall never loads any of it.

It answers, within 30 seconds: are we growing, are people discovering, are
they returning, are creators posting, are we making money, is the product
healthy?

## Architecture

```
Wall (public)  ──track──▶  /api/events, /api/track  ──▶  Postgres (Supabase)
                                                        │  raw tables: visits, visitors, events,
Stripe  ──webhook──▶  /api/stripe/webhook  ──────────▶  │  track, impressions, stories, api_minute,
Vercel cron ──▶ /api/cron/*  ─────────────────────────▶ │  ops_log, exports
                                                        │  metric functions fd_* (server key only)
/founder (server components, signed session cookie) ◀──┘
   └─ charts (client, own bundle) · exports (server jobs → private Storage)
```

- Every dashboard query runs on the server, through `fd_*` database functions
  that refuse calls without the server key. The browser gets numbers, never
  keys or raw rows it didn't ask for.
- Sign-in: Supabase email link, then the server checks `FOUNDER_EMAILS` (or
  `ADMIN_EMAILS`) and sets a signed, httpOnly session cookie.
- Filters live in the URL (`?range=30d&lane=music&visitor=new&source=instagram&device=mobile&country=NL`),
  so every view is linkable and every section keeps the same slice.
- Tracking from the wall is cheap and never blocks it: one small beacon per
  visit, batched impressions, the existing per-story events.
- Reports (daily founder summary, weekly growth, monthly financial) are
  report specs over the same data layer; the export pipeline renders them.

## Navigation → pages → KPIs → charts → drill-downs → source

| Page | Answers | KPIs | Charts | Drill-down | Source |
|---|---|---|---|---|---|
| **Pulse** (home) | Is it alive right now? | people here today, % returned, discoveries opened, saved, shared, creators started, spots bought + $ | last 24h by hour; Live now feed | feed row → spot | visits, events, track, stories |
| **Overview** | The executive view | unique visitors, spot opens, save rate, 7-day return rate, live spots, revenue: each with Δ vs previous period + sparkline | visitors over time; funnel Visit → Open → Save → Share → Create → Checkout → Live; Needs attention | KPI → its section; funnel step → section | all |
| **Growth** | Are we growing? | visitors, new, returning, accounts, creators | new vs returning (stacked area); creators over time | day → spots of that day | visits, visitors, stories, profiles |
| **Wall** | Is the wall working? | live spots, fill per lane, opens, open rate, save rate | lane fill (meters); lane performance (bars); top spots table | lane → filtered; spot → Spot page | spots, stories, events, impressions |
| **Creators** | Are creators posting? | creators, new creators, repeat rate, create starts, create completion | creators over time; Create funnel by step | creator → their spots | stories, track |
| **Revenue** | Are we making money? | gross, refunds, chargebacks, Stripe fees, net, payments, AOV, revenue per visitor / creator / live spot, checkout conversion | revenue over time; revenue by lane; transactions table | day → transactions; row → spot | stories (Stripe data stored by the webhook) |
| **Acquisition** | Where do people come from? | visitors by source, device, country, landing | bars per dimension; source over time | source → filter everything | visits, visitors |
| **Shares** | Is the flywheel turning? | shares, share rate, visits from shared links, share → visit ratio | shares over time; top shared spots | spot → Spot page | events (share), visits (landing /s/…) |
| **Retention** | Do people come back? | D1 / D7 / D30 return, 7-day return rate | weekly cohort heatmap; return rate over time | cohort → its visitors' activity | visits, visitors |
| **Operations** | Is it healthy? | requests, error rate, p95 latency, ingestion lag, webhook status, cron status, upload failures, database size, deployment | requests & errors over time; health grid | error → recent errors | api_minute, ops_log, cron.job_run_details, pg stats, env |
| **Events** | What is happening? | events per minute | realtime feed; raw event table (sort, search, filter) | event → spot | events, visits, track, stories |
| **Exports** | Take it with me | — | export history with status | download | exports (+ private Storage) |
| **Spot** (`/founder/spots/[id]`) | How did this spot do? | impressions, unique viewers, opens, open rate, saves, save rate, shares, share rate, outbound clicks, CTR, revenue, visits from its shares, creator, lane, number, live/expiry, status | timeline; the spot's own funnel; its sources; event history | event → feed | stories, impressions, events, visits |

## What is already measurable, and what needed new tracking

**Already measurable from the current wall and database**

- Spot opens (unique per visitor per day), saves, unsaves, shares, outbound
  link clicks, entries through a shared link, per story and per visitor (`events`).
- Live spots, fill per lane, held numbers (`spots`).
- Checkouts started (a reserved story) and completed (`stories.created_at`,
  `starts_at`), so checkout conversion and paid spots per lane.
- Gross revenue, refunds, net of refunds, sales count, AOV, revenue per lane
  and per creator (`stories.amount_total`, `refund_amount`, `maker_email`/`visitor`).
- Creators and repeat creators (distinct makers of paid stories).
- Reports, hidden and removed stories, moderation verdicts.
- Accounts (Keep my card sign-ins, `profiles`), teaser signups.
- Cron runs (`cron.job_run_details`) and database size.

**Needed new tracking (added with this build)**

| Metric | Why it wasn't possible | Added |
|---|---|---|
| Unique visitors, visits, new vs returning, 7-day return, D1/D7/D30 cohorts | only visitors who opened something were visible | `visit` beacon once per session → `visits`, `visitors` |
| Traffic source, device, country, landing page | never recorded | on the visit: UTM/referrer host, device class, `x-vercel-ip-country` (country only) |
| Impressions, unique viewers, open rate, CTR per spot | tiles seen were never counted | batched impression beacon → `impressions` (one row per story, visitor and day) |
| Visits generated by shares | a shared link's arrival wasn't linked to the story | visits landing on `/s/{lane}/{no}/{code}` record that story |
| Create funnel (started, steps, completed) | Create happened only in the browser | `create_start`, `create_step` in `track` |
| Stripe fees, chargebacks, net revenue | only the gross amount was stored | webhook stores the fee from the balance transaction; `charge.dispute.*` events store chargebacks |
| Request rate, error rate, latency, slow calls | nothing logged | API routes record per-minute stats (`api_minute`) after responding |
| Application errors, webhook failures, upload failures | not stored | `ops_log` (server) + client error beacon |
| Event ingestion latency | not measured | beacons carry the client time; lag = server time − client time |
| Deployment / version | — | Vercel's commit and deployment ids |

**Not collected, on purpose**

Names, emails or IP addresses of visitors (visitors are random ids; IPs are
only ever salted hashes); precise location (country only).

## Founder alerts (Needs attention)

Rules compare the last 24 hours with the same hours over the previous 7 days
and only fire with enough volume to mean something:

- traffic down > 40% (baseline ≥ 50 visits)
- checkout conversion down > 50% (≥ 10 checkouts started)
- event ingestion silent for 30 min while visits arrive, or lag > 5 min
- error rate > 2% (≥ 100 requests)
- any Stripe webhook failure in 24h
- a lane > 90% full
- Create completion down > 40% (≥ 10 starts)
- share traffic > 3× baseline (≥ 20 visits)
- a spot's open rate > 3× the median (≥ 50 impressions)

## Exports

CSV (raw tables), XLSX (financial/business workbooks with one sheet per
table), PDF (the founder report: KPIs, charts, top spots, revenue). Every
export uses the current range and filters, runs as a server job, lands in
private storage, and appears in the history with its status. The same
pipeline produces the scheduled reports:

| Report | When | Contents |
|---|---|---|
| Daily founder summary | every day, 07:00 | Pulse numbers for yesterday, alerts |
| Weekly growth report | Mondays | visitors, retention, acquisition, shares, top spots |
| Monthly financial report | the 1st | revenue, refunds, fees, chargebacks, per lane, transactions (XLSX + PDF) |
