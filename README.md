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
| Index strip (hidden by the approved CSS) | `app/wall/IndexStrip.tsx` |
| Preview player and demo synth | `app/wall/audio.ts` |
| Behaviour: glide, open/close, sheet ghost/drag/back, fly-to-card, tab bar, claims, minute tick | `app/wall/controller.ts` |

The controller decides what happens and hands React the state through
`app/wall/store.ts`; React renders it synchronously, so the controller can
measure and animate the new DOM straight away, as the reference did.

## Database

The Neon schema is `db/migrations/0001_init.sql`: 500 spots per lane, keyed
by `(lane, no)`. `db/queries.mjs` holds the spot lifecycle (reserve, go live,
release, expire). `pnpm test:db` runs both against an in-process Postgres
(PGlite); no database server needed.

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
