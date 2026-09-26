# fivehundrd. The Wall: build brief

This brief is for building the production Wall. The design is final. `reference.html` in this folder is a **complete, working prototype** and is the source of truth for every pixel, colour, spacing value, motion curve and piece of copy. Where this brief and `reference.html` disagree, `reference.html` wins.

The job is to turn this single-file prototype — real interaction, seeded demo data — into the real product on our stack, **without changing how it looks or feels**.

Open `reference.html` directly in a browser first, on both a phone-width and a desktop-width window, before reading further. Everything below describes what you'll see.

---

## 0. Confirmed product decision

The production product has **500 spots per lane**: 3,000 spots across Music, Books, Games, Creators, Podcasts and Newsletters. The prototype remains a 500-spot visual and interaction reference.

The per-lane pools mean:

- `spots.no` is unique per `(lane, no)`;
- the ring entry point and per-lane entry work per lane;
- the "Wall" tab shows a deterministic, balanced blend of at most 500 spots, so no view mounts all 3,000 tiles.

This decision was confirmed by Martijn before implementation began.

---

## 1. Pixel-perfect rules (non-negotiable)

1. **Port, don't redesign.** Copy the CSS from `reference.html` verbatim into the component styles: every custom property, every gradient, `box-shadow`, `border-radius`, font size, weight and letter-spacing. Do not "clean up" or swap in a UI kit. No Tailwind approximations of these values.

2. **Fonts.** Self-host Inter (400–900) and Fraunces (opsz 9–144, weights 600–900, italic 500–700) with the same weights the reference loads from Google Fonts. Use `font-display: swap` and the same fallback stacks. Fraunces is used only for:
   - the brand `Fivehundrd.`;
   - the Fivehundrd card title ("Your wall today.");
   - the footer tagline ("Good stories find good people.").

3. **Visual regression is the acceptance test.**
   - Add Playwright with a `?fixture=1` mode that loads the exact seeded demo dataset from the reference (`rng(500)`, the same name/snippet/palette lists, 30% vacant), freezes the clock to `2026-09-24T12:00:00Z`, and fixes the visitor's ring-entry seed.
   - Render `reference.html` and the production page with the same fixture at **390×844** (phone), **700×900** (just above the phone/desktop breakpoint) and **1400×900** (desktop), in light and dark mode.
   - Compare with `maxDiffPixelRatio: 0.001`.
   - Cover these states: wall with nothing open; a tile open inline (desktop); the phone bottom sheet open; each lane filter; the search empty state; "Create your story"; the success screen with the social card; the share sheet; the Fivehundrd card with 0, a few, and 13+ saves; the footer in view.
   - The PNGs in `screens/` are for orientation only, rendered without the self-hosted fonts. Generate the real baselines from `reference.html` with the fonts wired up as in rule 2.

4. **Mobile and desktop show the same information.** Only the layout and the open/close mechanism differ (§7). Anything visible on one exists on the other.

5. **No new copy.** All strings come from the reference, exactly as written.

---

## 2. Stack

| Concern | Choice |
|---|---|
| App | Next.js (App Router) on Vercel Pro |
| Database | Neon Postgres |
| Media (artwork, logos, audio) | Cloudflare R2, direct signed uploads |
| Payments | Stripe Checkout + webhooks, Stripe Tax |
| Mail | Resend |
| Errors | Sentry |
| DNS | Cloudflare (domain at TransIP) |

---

## 3. What the product is

Five hundred numbered spots, each held by one maker for 72 hours at $9.95. A maker gets a tile: their artwork, name, lane and a short pitch, plus up to three links out (Spotify, Steam, a website, whatever fits). Visitors browse the wall, open tiles to read, listen or watch a preview, save the ones they like, and share.

There is deliberately **no feed and no algorithm**. The one piece of personalisation is where a visitor's wall *starts*: everyone sees the same 500 spots, in the same numbered order, but each visitor's browsing session begins at a different spot (§5), so there is no permanent "front row".

---

## 4. Design tokens

**Base palette**

```
--bg:#ffffff  --paper:#ffffff  --aged:#e4d3ae  --ink:#0d0d0d  --ink2:#615a4d  --line:#e4e0d8
--pink:#ff7bc3  --lime:#d8ff45
```

The wall's background is white, top to bottom, including the header and the footer. `--aged` is only used for the ageing tint on tiles (below) and the Fivehundrd card's paper tone.

Dark mode: `--bg:#15130f --paper:#1f1c17 --aged:#2e2618 --ink:#f2ede2 --ink2:#a0977f --line:#39342b` (`prefers-color-scheme`, overridable with `data-theme`).

**Lane bindings** (`c1` = tile accent / top-rule / progress-bar colour, `c3` = logo-tile background, `pill`/`pillt` = the eye/bookmark pill colours; every lane except Music is pink-pill-on-ink, Music is ink-pill-on-pink)

| Lane (label) | c1 | c3 |
|---|---|---|
| music (Music) | #ff7bc3 | #0d0d0d |
| podcasts (Podcasts) | #6e1f48 | #ff7bc3 |
| games (Games) | #d8ff45 | #0d0d0d |
| art (**Creators**) | #3b4712 | #d8ff45 |
| writers (**Books**) | #151412 | #ff7bc3 |
| letters (Newsletters) | #ece0c2 | #0d0d0d |

**Derived values**

- **Text-on-colour switch:** if the relative luminance of `c1` is above 0.28, text sits dark (`#141210`); otherwise light (`#fbf5e6`).
- **Ageing:** `--age = (1 - timeLeft/72h) * 0.9`, used to fade a tile's accents toward `--aged` as its 72 hours run out.
- **Constants:** `TOTAL = 500`, `LIFE = 72h`, `PRICE = "$9.95"`.

---

## 5. The circle: how spots are ordered and where you start

- Spots are numbered 1–500 and shown in that order. The wall is conceptually a **circle**: after 500 it continues at 1.
- **Entry point:** once per visitor per day, a random float is generated and stored in a first-party cookie (`fh_entry = {day, r}`). It's mapped onto the list of currently *filled* spots so a visitor never lands on a vacant one, walking forward to the nearest filled spot at or beyond that position. Per lane, the same logic runs over that lane's filled spots.
- The wall API returns the **same list to everyone** — the ring is computed client-side from the entry point, so the wall response itself is fully cacheable and identical for all visitors.
- The visitor's own Fivehundrd card shows "You walked in at No. 396" with a "Take me back" action that jumps to that spot.
- This is the whole answer to "no front row": every visitor's session starts somewhere else, so every spot gets a turn at the top over the life of the wall.

---

## 6. The wall itself: tiles

Spots render as a **grid of clean, square-ish tiles** on the white background — no spines, no books, no posters, no tilt or tape. Rows hold **3 tiles under 430px, 4 under 640px, 5 at 640px and up**, recomputed on resize (`colsNow()` in the reference), 9–10px gaps.

**A filled tile**
- A 1:1 artwork square at the top: the maker's own artwork image, or — if they only supplied a logo — that logo centred on the lane's `c3` colour, or (demo data only) a generated seeded pattern (`genArt`, four/five motif families in the lane palette). Production always has real artwork or a logo; the generator is prototype-only filler.
- A number chip, top-right, on white.
- A pink dot, top-left, for the first ~3 hours after going live.
- A strip beneath the artwork with a 3px `c1` top rule, the maker's name (bold, truncated to one line), and the lane icon + label.
- A 3px `c1` progress bar along the tile's bottom edge, shrinking as the 72 hours run out.
- Below the tile card itself: **time left**, and two small pink pills with the eye icon (times opened) and bookmark icon (times saved), both live counts.
- **States:** resting (1px `--line` border); hover on desktop (ink border, 2px lift); open (pink border + ring).

**A vacant tile** is a dashed outline reading "Open spot", with "No. 300" and a pink "Claim for $9.95" pill beneath it.

**Opening a tile**
- **Desktop (≥700px):** tapping/clicking a tile opens the full view directly **under that tile's row** — a lane-coloured frame with a small notch pointing up at the tile you picked — pushing the rest of the wall down. Clicking the same tile again closes it.
- **Phone (<700px):** see §7 — a full bottom sheet, not an inline panel.
- Opening marks the spot "seen today" and increments its open count once per visitor per session.

**Full view contents** (`coverHTML` in the reference) — identical on phone and desktop, just laid out differently:
- The artwork, large.
- `No. 042 · Lane · Xd Xh Xm Xs left` (ticking every second while open).
- The maker's name, large, and their one-line pitch.
- A **per-lane extra block** (§8).
- Up to three links, each auto-labelled by domain (Spotify, Apple Music, Steam, Instagram, YouTube, Substack, Goodreads, Discord, etc. — see `parseLink`'s domain map).
- Share, Save and Next-spot actions.

---

## 7. Phones (<700px): the tile comes forward as a sheet

On phones, opening a tile does **not** push the row down — the tile's content comes to the front as a **bottom sheet**, so nothing requires scrolling to see:

- The sheet (`#dsheet`) rises over a blurred, dimmed backdrop (`#dveil`): 22px top corners, framed in the spot's lane colour, a grab handle, a white circular close button top-right. Max height `100dvh - 40px - safe-area-top`; the content inside scrolls if needed.
- **Opening animation** (440ms, `cubic-bezier(.2,.9,.25,1)`): the tile's own artwork visually travels from its position in the grid into the sheet's artwork square (a cloned "ghost" element animates between the two rects), while the sheet itself rises from the bottom. It reads as the tile lifting off the wall and becoming the sheet.
- **Closing:** the × button, tapping the backdrop, Escape, the iOS/Android back gesture (implemented with `history.pushState`/`popstate` so the hardware/software back button closes it), or a downward drag (release past 120px, or a fast flick, dismisses; otherwise it snaps back). After closing, the wall scrolls so the tile you had open is back in view.
- **Next spot**, tapped inside the sheet, slides the next tile's content into the *same* sheet rather than closing and reopening.
- **Save**, tapped inside the sheet, doesn't fly a ghost across the (mostly off-screen) card — it pops the Save button and pops the "My card" badge in the bottom tab bar instead.
- Lane switches, search and first page load never pop the sheet uninvited — only a direct tap on a tile, or landing on a deep link (`/s/217`) at that screen width, opens it automatically.
- Rotating past the 700px breakpoint while the sheet is open closes it and reopens the same spot as an inline panel, and vice versa.

---

## 8. Per-lane content inside the open view

| Lane | Extra block | Production source |
|---|---|---|
| Music, Podcasts | A preview player: play/pause, a 52-bar waveform (click/drag to seek), `0:00 / 0:30` counter, and a caption ("30-second preview. Full version on Spotify." / "Episode trailer.") | The maker uploads a clip up to 30s (≤4MB) to R2. If no clip, fall back to a Spotify/Apple embed if the CSP allows it. **The WebAudio synth generator must not ship** — it exists in the reference purely so demo tiles have something audible to click; real makers always supply real audio. |
| Books, Newsletters | "First pages" / "Latest issue": a drop-capped excerpt with a fade and "Keep reading" to expand | Text entered by the maker (≤2,500 characters), stored in the database |
| Games, Creators | A play button and duration badge overlaid on the artwork, linking out to the video | A YouTube trailer URL; duration fetched via oEmbed or the Data API |

---

## 9. Header, footer, search

**Header** (from the 16 Sep "Fivehundrd Wall Mockup", adapted): `Fivehundrd.` (pink full stop) with the italic Fraunces slogan "Discover before the crowd." beneath it; lane tabs (Wall/Music/Books/Games/Creators/Podcasts/Newsletters) that filter the wall; a live search box; a black "Create" button (hidden on phones — Create lives in the tab bar instead, §10); an avatar placeholder. No notification bell.

**Search** matches name, lane label and snippet; hides vacant tiles while a query is active; shows a "Nothing on the wall matches '…' — clear the search" empty state.

**Footer**: white background, black text, a solid black top border, `Fivehundrd.` in Fraunces with the tagline "Good stories find good people.", three link columns (The wall / For makers / Fivehundrd), and a copyright + "500 spots. Three days each." legal line. The phone tab bar (§10) is also white with black icons.

---

## 10. The Fivehundrd card (personal dashboard)

A persistent, personal panel — desktop: sticky in the left rail; phone: a bottom sheet opened from the tab bar — styled like a library card: cream card stock, a hard offset shadow, a punch-hole.

Contents, top to bottom:
1. "Fivehundrd card · [today's date]"
2. "Your wall today." (Fraunces, pink full stop)
3. "You walked in at No. 396" with a **Take me back** action (§5)
4. Three stat tiles: opened today / saved / still unseen
5. Six small lane chips showing how many of that lane the visitor opened today (dimmed at 0)
6. **Your saves, leaving first** (§11)
7. A "Keep my card" nudge once there's ≥1 save and no account (§12)
8. Wall-wide numbers: live count, spots open, time until the next spot frees

**On phones**, the card lives behind a bottom tab bar (a fixed white bar, top border, soft shadow) with three items:
- **Wall** — closes the card if open; otherwise scrolls to the top.
- **My card** — toggles the Fivehundrd card as a bottom sheet with a grab handle over a dimmed backdrop; shows a pink badge with the save count.
- **Create** — a lime button that opens "Create your story" directly.

---

## 11. Saves

- A save is keyed by **story, not spot number** (`spot_no + start_time`), with a small snapshot (name, lane, first link, logo/artwork ref) stored alongside it — so a save survives its spot ending, and never silently points at whoever claims that number next.
- Each save renders as a **small square tile** in the same visual language as the wall tile: square artwork, thin border, a `c1` bottom rule, a time-left chip top-left (switching to ink/lime under 6h remaining, or "Ended" once the spot's gone), the name underneath.
- Layout: **4 across, 3 down — 12 visible at once**, then "Show N more" in steps of 12, and "Show less" once fully expanded. Live saves sort "leaving first" (least time remaining); ended ones follow, greyscale at 55% opacity, linking out to the maker's first link.
- A small × sits on each tile's corner to remove it (always visible on touch, hover-only on desktop pointers).
- **Saving from the wall** flies the tile's own artwork from its grid position into its new square on the card (desktop) or into the "My card" tab (phone, card closed), shrinking as it lands. Saving from inside the phone sheet (§7) instead pops the Save button and the tab badge.
- **Saves are always remembered** — no expiry — via a cookie/local-storage pairing that syncs to an account once the visitor logs in (§12).

---

## 12. "Keep my card" (optional login)

Browsing and saving **never require an account**. Once a visitor has ≥1 save, a lime nudge appears on the card: "Take your card to every device, and we'll remind you before saved spots end." → **Keep my card**, which opens a sheet offering:
- Continue with Google
- Continue with Apple
- An email magic link
- A checkbox, checked by default: "Remind me an hour before a saved spot ends"

Logging in only (a) syncs the cookie-based saves to the account so they follow the visitor across devices, and (b) enables the reminder email. It changes nothing else about browsing.

---

## 13. Claiming a spot ("Create your story")

Opened from the header Create button (desktop) or the tab bar (phone), or by tapping a vacant tile.

- Title: **"Create your story."** Subline: "Spot 111. $9.95, live straight away for three days." with a "Pick another number" chip that rerolls the vacant spot offered (purely cosmetic — no number confers any advantage; see the promise text below).
- A pink-bordered promise block: **"There's no front row. Every visitor starts somewhere else on the wall, so every spot gets its turn at the top."**
- Fields: Name; Lane (one of the six); Artwork/logo upload; an optional per-lane field (§8: audio clip / first-pages text / trailer URL); up to three links; a preview snippet (≤140 chars). A live preview tile updates as the maker types.
- On submit: validate, then in production reserve the spot number, create a Stripe Checkout session (§15), and only mark it live on the webhook.
- Success screen: "You're on the wall." with a canvas-drawn 1080×1350 **social card** (see `drawCard` in the reference for the exact layout — wordmark sticker, artwork, "Live for 3 days" tag, name, footer band) to share or save, plus a "See it on the wall" link.

---

## 14. Data model (Neon)

The schema lives in [`supabase/migrations/`](supabase/migrations/) (Supabase replaces Neon, R2 and the login provider) and is tested by `pnpm test:db`. The spot lifecycle from §15 is the checkout functions there (`checkout_reserve`, `checkout_attach`, `checkout_complete`, `checkout_release`, and the minute tick). Compared with the first draft of this section:

- **500 spots per lane (§0).** `spots` is keyed by `(lane, no)`, and the migration seeds all 3,000 rows. A composite foreign key ensures the story on a spot has the same lane and number as that spot.
- **Creation order.** `stories` is created before `spots`, which references it. The draft had them the other way round, so it could not run.
- **`lanes` table.** Lane ids, labels (`art` → Creators, `writers` → Books) and tab order are stored once and referenced everywhere.
- **Per-lane content (§8).** `audio_embed_url` holds the Spotify/Apple fallback. Check constraints keep audio on Music/Podcasts, excerpts on Books/Newsletters and trailers on Games/Creators.
- **Integrity.** A story needs artwork or a logo (§6), has 1–3 links, and is either pending (no times) or live for exactly 72 hours. A vacant spot holds no story; a reserved or live one does. Only reservations carry `reserved_until`.
- **Events.** A `day` column plus a partial unique index count an `open` once per visitor per story per day, so the wrap-up mail's numbers can't be inflated by reloading. `entry` records the spot a visitor's wall started on (§15 wrap-up).

## 15. API and flows

**Endpoints**
- `GET /api/wall`: all 500 spots with public story fields and live counts. Edge-cache 15s with stale-while-revalidate; revalidate on purchase and on expiry.
- `POST /api/uploads/sign`: signed R2 upload for artwork, logo or audio, with type/size limits.
- `POST /api/checkout`:
  1. Validate the form (same rules and error copy as the reference).
  2. **Reserve the spot number** in its lane (`checkout_reserve`): `update spots set status='reserved', reserved_until=now()+30min, story_id=$3 where lane=$1 and no=$2 and status='vacant'`. If 0 rows update, offer another vacant number.
  3. Create the Stripe Checkout session for $9.95, with the reservation in its metadata and `expires_at` 30 minutes out (Stripe's minimum). Then set the reservation to end at the session's `expires_at` (`checkout_attach`), so no payment can arrive after the number is released.
- `POST /api/stripe/webhook`: on `checkout.session.completed`, set the spot live (`starts_at=now()`, `ends_at=now()+72h`), revalidate the wall, send the "You're on the wall" mail. On `checkout.session.expired`, free the number straight away (`checkout_release`).
- `POST /api/events`: record opens/saves/clicks. Rate-limit per cookie and per IP hash; drop bots except Googlebot.

**Jobs**
- Every minute: free expired spots; release stale reservations.
- One hour before a spot expires: send the extend-or-not mail with real numbers for that run.
- At expiry: send the wrap-up mail (opens, saves, link clicks, and how often the tile sat at the top of a visitor's wall — see §5).

**Sharing**
- Each spot gets a real page at `/s/[no]`, which loads the wall with that tile's view open (as the sheet on phones, inline on desktop).
- Its OG image is server-rendered (`@vercel/og`) matching the canvas social card (§13).
- "Share my card" on the success screen, and Share inside any open tile, use native share where available, falling back to a sheet with WhatsApp, Telegram, X, Facebook, Email and Copy link (see `shareSheet` in the reference).

---

## 16. Performance budget

- 60fps scrolling on a mid-range Android; no layout reads inside scroll/resize handlers beyond what `colsNow()`/row-rebuild needs.
- All 500 tiles render in the DOM (no virtualization — it would break row/notch positioning and the open/close motion).
- Wall JSON under 60KB gzipped. LCP under 1.8s on 4G.

---

## 17. Acceptance checklist

- [ ] Visual regression passes at 390, 700 and 1400px, light and dark, for every state in §1.
- [ ] Two browsers get different ring entry points; one browser keeps its entry point for the whole day.
- [ ] A double purchase of the same spot number is impossible under concurrent checkouts.
- [ ] A spot goes live only after the Stripe webhook; an abandoned checkout frees the number after 30 minutes.
- [ ] `/s/217` renders a correct link preview in WhatsApp, iMessage and X.
- [ ] Open/save counters and saves survive reloads; saves persist without an account and sync correctly once one is created.
- [ ] The phone sheet: opens on tap, ghost-animates from the tile, closes via ×/backdrop/Escape/back-gesture/drag, and Next-spot swaps content in place.
- [ ] Reduced-motion: no pull/fly/ghost animations; state changes are instant.
- [ ] All copy matches the reference string for string, including the wall's "no front row" promise.
