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

`/` is a Next.js page (`app/page.tsx`). The prototype is being moved into
typed modules and React components piece by piece. After each piece the
visual suite must still match the reference.

| Part | Where it lives now |
|---|---|
| CSS | `app/wall/wall.css`, copied verbatim from `reference.html` and inlined as-is (not through the CSS pipeline, which rewrites values) |
| Demo data, lanes, time, artwork, icons | `lib/wall/*` (typed) |
| Wall order: lanes, search, ring, rows | `lib/wall/rack.ts` |
| Header, footer, tab bar, overlays | `app/wall/Chrome.tsx` (React) |
| Lane tabs, tiles | `app/wall/LaneNav.tsx`, `Rack.tsx`, `Tile.tsx` (React) |
| Open tile (panel, phone sheet), card, saves, audio, index strip, Create, sharing | `app/wall/legacy.js`, the rest of the prototype script, still to port |

The remaining script owns the wall's state for now. It hands React the lane
and the rack through `app/wall/store.ts`, and React renders synchronously.

`/reference.html` serves the same copy as the fixed reference for the visual
suite. It returns 404 in production, so the prototype-only code (the WebAudio
synth, seeded demo data) does not ship from there.

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
state in BUILD_BRIEF §1.3. The allowed difference is `maxDiffPixelRatio: 0.001`
with a per-pixel `threshold` of 0. Baselines are regenerated from the
reference on each run and are not committed.

To use an already installed Chromium instead of Playwright's download, set
`CHROMIUM_PATH=/path/to/chrome`.
