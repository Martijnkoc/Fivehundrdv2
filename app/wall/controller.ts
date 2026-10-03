/*
 * The wall's behaviour, ported from reference.html's script: lanes, search,
 * the entry point, opening and closing spots (the desktop glide and inline
 * panel, §6; the phone sheet with its ghost, drag and back gesture, §7),
 * saves and the fly-to-card animations (§11), the phone card and tab bar
 * (§10), claiming a spot (§13), sharing (§15) and the minute tick.
 *
 * React renders everything (app/wall/*.tsx); this decides what happens, hands
 * React the state through `bridge`, and runs the measurements and animations
 * on the rendered DOM, as the reference did.
 */
import { endedToShow, prefillFrom, sameNumber, type EndedStory } from "../../lib/wall/again";
import { PAL, seedWall } from "../../lib/wall/demo";
import { buildLiveWall, mediaURL, mergeFeed, openNumbers, type Feed } from "../../lib/wall/live";
import { LANE, LANES, LIFE, TOTAL, numOf, pad, seenKey, type FilledSpot, type LaneId, type NavId, type Spot } from "../../lib/wall/model";
import { buildRack } from "../../lib/wall/rack";
import { savesOrder as savesOrderOf, skey, type SaveEntry } from "../../lib/wall/saves";
import { SCOUT as SCOUT_CFG, type ScoutMe } from "../../lib/wall/scout";
import { bigSpots as bigSpotsFor, sinceLastVisit, type VisitMemory } from "../../lib/wall/hot";
import type { MakerNumbers } from "../../lib/site/reminderEmail";
import { inHoldout, personalItem, wallToday, type Finds } from "../../lib/wall/retention";
import { left, short, styleFor } from "../../lib/wall/time";
import { startPlay, stopAudio, togglePlay } from "./audio";
import { startFeel } from "./feel";
import { createGlide } from "./glide";
import { createLayers } from "./layers";
import { bumpTab, flyToCard as flyIntoCard, flyToTab, morphOpen as morphInto } from "./motion";
import { installSheetDrag } from "./sheetDrag";
import { drop, read, readText, write, writeText } from "./storage";
import type { Account } from "./Card";
import type { Draft } from "./Claim";
import type { ShareData } from "./Sheets";
import { cardFileName, readyCard, shareCardBlob } from "./shareCard";
import { wallStore, type Bridge } from "./store";
import * as liveApi from "./liveClient";
import { laneBySlug, lanePath } from "../../lib/site/facts";
import { CREATE, MAKER } from "../../lib/site/copy";
import { createMoment, startTracking, surface, unwatchTiles, visitorId, watchTiles } from "./track";

type Opts = { align: boolean };
/** The live wall (Supabase): the feed it was built from and the storage base URL. */
export type Live = { feed: Feed; base: string };

/**
 * Starts the wall on the rendered page and returns `stop`, which undoes it:
 * every listener goes with one AbortController, every interval is cleared.
 * Leaving the wall by a link inside the app and coming back mounts it anew,
 * so the old run must let go of the old page (WallRuntime calls stop).
 */
export function startWall(bridge: Bridge, live?: Live): () => void {
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const alive = () => !ac.signal.aborted;
  const intervals: number[] = [];
  const every = (f: () => void, ms: number) => void intervals.push(window.setInterval(f, ms));
  function stop() {
    if (!alive()) return;
    ac.abort();
    intervals.forEach(clearInterval);
    unidle(buildT);
    clearTimeout(qT);
    clearTimeout(warmT);
    clearTimeout(beatT);
    glide.cancel(false);
    rackWatch?.disconnect();
    unwatchTiles();
    layers.stop();
    stopAudio();
    document.documentElement.classList.remove("sheet-lock");
    document.body.style.overflow = "";
  }
  bridge.reset();
  const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* a tile phones haven't built yet is built on the spot (see buildRest) */
  const spotEl = (no: number) => document.getElementById("s-" + pad(no)) ?? (ensureAll(), document.getElementById("s-" + pad(no)));
  const noOf = (el: Element) => +(el as HTMLElement).dataset.no!;
  const filledOf = (el: Element) => WALL[noOf(el) - 1] as FilledSpot;

  /* phones and tablets: the card is behind the tab bar, and Back closes what is open (layers.ts) */
  const narrow = () => matchMedia("(max-width:979px)").matches;
  const layers = createLayers();

  /* ---------- the wall: live stories, or demo data plus this browser's own claims ---------- */
  const WALL: Spot[] = live ? buildLiveWall(live.feed, live.base, liveApi.mineIds()) : seedWall();
  if (!live) {
    const mine = read<FilledSpot[]>("fh-claims", []);
    if (Array.isArray(mine)) for (const s of mine) if (Date.now() - s.start < LIFE) WALL[s.no - 1] = s;
  }
  bridge.setWall(WALL);
  /* the live wall promises reminders only once they are sent (docs/retention.md) */
  const REMINDERS = !live || process.env.NEXT_PUBLIC_REMINDERS === "1";
  bridge.setMode(!!live, REMINDERS);
  /** Counts an open, save, share… on the live wall. */
  const ev = (id: string | undefined, kind: liveApi.EventKind) => {
    if (!live || !id) return;
    if (kind !== "save" && kind !== "unsave") return liveApi.sendEvent(id, kind);
    /* Scout: a signed-in Timeheart is a call made by the account (the server checks the token). The
       session is read directly, not from ACCOUNT, which is only filled once syncAccount() returns */
    void liveApi.authToken().then((t) => {
      liveApi.sendEvent(id, kind, t);
      if (!t) return;
      if (kind === "save") setTimeout(loadScout, 2500);
      /* a logged-in visitor's saves follow them to every device */
      if (kind === "save") setTimeout(syncAccount, 1500);
      if (kind === "unsave") liveApi.unsaveForAccount(id).catch(() => {});
    });
  };
  /** A spot's address: /s/music/217 on the live wall, #217 on the demo wall. */
  const addressOf = (s: FilledSpot) => (live ? `/s/${s.lane}/${numOf(s)}${s.slug ? "/" + s.slug : ""}` : "#" + pad(s.no));
  const homeAddress = () => (live ? lanePath(lane) : location.pathname + location.search);

  /* ---------- lanes and search (§9) ---------- */
  /* a lane's own address (/lanes/music) opens the wall on that lane */
  let lane: NavId = (laneBySlug(location.pathname.match(/^\/lanes\/([a-z]+)\/?$/)?.[1] ?? "")?.id as NavId) ?? "all";
  const renderLanes = () => bridge.setLane(lane);
  function setLane(k: NavId) {
    lane = k;
    if (live)
      try {
        history.replaceState(null, "", lanePath(k));
      } catch {}
    renderLanes();
    renderRack();
    window.scrollTo({ top: 0 });
  }
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    const a = t.closest<HTMLElement>("[data-lane]");
    if (a && (a.closest("#lanes") || a.closest("#footLanes"))) {
      e.preventDefault();
      setLane(a.dataset.lane as NavId);
      return;
    }
    if (t.closest("[data-claim]")) {
      e.preventDefault();
      openClaim();
      return;
    }
    if (t.closest("#brand")) {
      e.preventDefault();
      wholeWall();
    }
  }, sig);
  let query = "",
    qT: ReturnType<typeof setTimeout> | undefined;
  /* phones: the search button opens the search field in place of the brand, and closes it again */
  const top = $("#top"),
    qInput = $<HTMLInputElement>("#q"),
    qToggle = $("#searchToggle");
  function setSearching(on: boolean) {
    top.classList.toggle("searching", on);
    qToggle.setAttribute("aria-expanded", String(on));
    qToggle.setAttribute("aria-label", on ? "Close search" : "Search the wall");
    if (on) qInput.focus();
    else if (qInput.value) {
      qInput.value = "";
      qInput.dispatchEvent(new Event("input"));
      qInput.blur();
    } else qInput.blur();
  }
  /** The whole wall, without a search: from the brand, and when a Hotspot isn't on this lane. */
  function wholeWall() {
    qInput.value = "";
    query = "";
    setLane("all");
  }
  qToggle.addEventListener("click", () => setSearching(!top.classList.contains("searching")), sig);
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && top.classList.contains("searching")) setSearching(false);
  }, sig);
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => {
      query = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderRack();
      window.scrollTo({ top: 0 });
    }, 140);
  }, sig);

  /* ---------- the rack (§5, §6) ---------- */
  const rack = $("#rack");
  startFeel(rack);
  /* the Control Room's measurements (live wall only): the visit, and which live tiles were seen */
  let rackWatch: MutationObserver | undefined;
  if (live) {
    startTracking();
    let wq = 0;
    const watch = () => {
      wq = 0;
      if (!alive()) return;
      watchTiles(rack, ".spot[data-no]:not(.vacant)", (el) => {
        const s = WALL[noOf(el) - 1];
        return s && !s.vacant ? s.id : undefined;
      });
    };
    rackWatch = new MutationObserver(() => {
      if (!wq) wq = window.setTimeout(watch, 400);
    });
    rackWatch.observe(rack, { childList: true, subtree: true });
    watch();
  }
  let open: HTMLElement | null = null;
  /* one entry point per visitor per day, kept in the browser (a cookie in the real build) */
  let ENTRY_R = Math.random(),
    entryNo = 1;
  {
    const today = new Date().toISOString().slice(0, 10),
      e = read<{ day: string; r: number } | null>("fh-entry", null);
    if (e && e.day === today) ENTRY_R = e.r;
    else write("fh-entry", { day: today, r: ENTRY_R });
  }
  let COLS = 5;
  const colsNow = () => {
    const w = rack.clientWidth || rack.parentElement!.clientWidth;
    /* craft pass: phones get two columns, so tiles read as covers */
    return w < 430 ? 2 : w < 640 ? 3 : 5;
  };
  addEventListener("resize", () => {
    if (colsNow() !== COLS) {
      const keep = open ? noOf(open) : null;
      renderRack();
      if (keep) {
        const el = spotEl(keep);
        if (el) swapTo(el, false);
      }
    }
  }, sig);
  /*
   * The wall is built a few rows at a time: the first screens at once, the
   * rest while the browser is idle, so the wall is there and scrolls straight
   * away (phones since the mobile audit, every screen since the speed pass;
   * a desktop wall at once was a second of blocked page). Rows out of view
   * aren't laid out or painted either (content-visibility, overrides/), sized
   * from the first row. Steps are small on phones (a phone row is two or
   * three tiles, and six rows were a 100ms stall on a mid-range phone).
   */
  const FIRST_ROWS = 4;
  const compactNow = () => matchMedia("(max-width:699px)").matches;
  const rowsPerStep = () => (compactNow() ? 2 : 6);
  let built = Infinity,
    total = 0,
    buildT = 0;
  const idle = (f: () => void) =>
    "requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 120 }) : (setTimeout(f, 30) as unknown as number);
  const unidle = (id: number) => ("cancelIdleCallback" in window ? cancelIdleCallback(id) : clearTimeout(id));
  function buildRest() {
    unidle(buildT);
    if (built >= total) return;
    buildT = idle(() => {
      built += rowsPerStep();
      bridge.setLimit(built >= total ? Infinity : built);
      buildRest();
    });
  }
  function ensureAll() {
    unidle(buildT);
    if (built >= total) return;
    built = Infinity;
    bridge.setLimit(Infinity);
  }
  /*
   * Craft pass: the spots with traction right now are shown big on the wall.
   * Rare on purpose: lib/wall/hot.ts (bigSpots) caps them and needs real
   * activity behind each. Fixed at each build of the wall, so nothing moves
   * under the visitor.
   */
  function bigSpots() {
    return bigSpotsFor(WALL, live ? (live.feed.hot ?? []) : null, lane);
  }
  function renderRack() {
    open = null;
    const C = (COLS = colsNow());
    const r = buildRack({ wall: WALL, lane, query, cols: C, entryR: ENTRY_R, big: bigSpots() });
    entryNo = r.entryNo;
    bridge.setCompact(compactNow());
    total = r.items.length;
    built = FIRST_ROWS;
    bridge.renderRack(r, built >= total ? Infinity : built);
    /* rows out of view are sized from the first (at the wall's start it is rendered a moment later) */
    const measure = () => {
      const row = rack.querySelector<HTMLElement>(".shelf-row");
      if (row) rack.style.setProperty("--row-est", row.offsetHeight + "px");
      return !!row;
    };
    if (!measure()) requestAnimationFrame(() => alive() && measure());
    buildRest();
    renderCard();
  }

  /* ---------- the visitor: saves (§11), seen today, account (§12) ---------- */
  let SAVES = read<SaveEntry[]>("fh-saves", []);
  bridge.setSaved(SAVES.map((x) => x.k));
  /* retention (docs/retention.md): each Find's save count as the last visit
     left it (for "moving"), and its history from the database */
  const PRIOR = new Map(SAVES.map((x) => [x.k, x.count] as const));
  let FINDS = read<Finds>("fh-finds", {});
  const isSaved = (s: FilledSpot) => SAVES.some((x) => x.k === skey(s));
  function persistSaves() {
    write("fh-saves", SAVES);
    bridge.setSaved(SAVES.map((x) => x.k));
  }
  let ACCOUNT: Account | null = null;
  /* on the live wall the login itself says whether the card is kept (syncAccount) */
  if (!live) ACCOUNT = read<Account | null>("fh-account", null);

  /* ---------- Scout (docs/scout.md): the signed-in visitor's card and calls ---------- */
  /** the Timeheart that led to signing in, so it can still count (30 minutes, checked again by the server) */
  const PENDING_KEY = "fh-scout-pending";
  const NUDGE_KEY = "fh-scout-nudge";
  let SCOUT: ScoutMe | null = null;
  /** The demo wall has no accounts: a demo Scout is this browser's Timehearts, building (or a seeded card, fh-scout). */
  function demoScout(): ScoutMe | null {
    if (!ACCOUNT) return null;
    const seeded = read<ScoutMe | null>("fh-scout", null);
    if (seeded) return seeded;
    return { name: null, since: new Date().toISOString(), share: null, status: "building", percentile: null, calls: SAVES.length, early: 0, hotspots: 0, settled: 0, minSettled: SCOUT_CFG.minSettled, best: null, moves: [], list: [] };
  }
  let scoutT = 0;
  async function loadScout() {
    clearTimeout(scoutT);
    if (!ACCOUNT) return;
    if (!live) {
      SCOUT = demoScout();
      renderCard();
      return;
    }
    const me = await liveApi.scoutMe();
    if (me && alive()) {
      /* the desktop rail shows the card on every visit: counted once a visit */
      if (!SCOUT && !narrow()) surface("scout_card_view");
      SCOUT = me;
      renderCard();
      /* something you Scouted broke out while you were away */
      refreshSince(false);
    }
  }
  /** After a Timeheart without an account: the line that says what signing in is for, once a day. */
  function scoutNudge(s: FilledSpot) {
    if (ACCOUNT) {
      if (!live) {
        SCOUT = demoScout();
        renderCard();
      }
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (readText(NUDGE_KEY) === today) return;
    writeText(NUDGE_KEY, today);
    bridge.setScoutNudge(skey(s));
    surface("scout_prompt_shown", s.id);
    /* phones: the prompt sits under the buttons, often below the sheet's fold; bring it into view */
    setTimeout(() => {
      const n = document.querySelector<HTMLElement>(".dsheet .scout-nudge");
      if (n && n.offsetParent) n.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 450);
  }
  const scoutURL = (slug: string) => `${location.origin}/scout/${slug}`;
  let savesShown = 12;
  const OPENED = new Set<string | number>();
  const TODAY = new Date().toISOString().slice(0, 10);
  let SEEN = new Set<string | number>();
  {
    const d = read<{ day: string; nos: (string | number)[] } | null>("fh-seen", null);
    if (d && d.day === TODAY && Array.isArray(d.nos)) SEEN = new Set(d.nos);
  }
  function markSeen(no: string | number) {
    if (SEEN.has(no)) return;
    SEEN.add(no);
    write("fh-seen", { day: TODAY, nos: [...SEEN] });
  }
  const savesOrder = () => savesOrderOf(SAVES, WALL);
  function renderCard() {
    /* a saved story's latest count, kept for after its spot has ended */
    if (live) {
      let changed = false;
      for (const x of SAVES) {
        if (x.rank == null) continue;
        const cur = WALL.find((w) => !w.vacant && skey(w) === x.k) as FilledSpot | undefined;
        if (cur && cur.saves != null && cur.saves !== x.count) {
          x.count = Math.max(cur.saves, x.rank);
          changed = true;
        }
      }
      if (changed) persistSaves();
    }
    bridge.setCard({
      seen: new Set(SEEN),
      saves: [...SAVES],
      savesShown,
      account: ACCOUNT,
      ...(narrow() && { finds: true }),
      history: FINDS,
      reminders: REMINDERS,
      makers: MAKERS,
      ended: endedToShow(ENDED, WALL.some((s) => !s.vacant && s.mine && left(s) > 0)),
      /* live wall: every lane's 500 numbers, less the live and held ones (the rack shows only some open spots) */
      openSpots: live ? Math.max(0, LANES.length * TOTAL - live.feed.stories.length - live.feed.held.length) : undefined,
      scout: ACCOUNT ? SCOUT : null,
      today: wallToday({ saves: savesOrder(), prior: PRIOR, fresh: wallStore.get().since?.fresh ?? 0 }),
    });
  }

  /**
   * The Timeheart (craft pass): keeping a find beats once. The heart fills,
   * its clock hands sweep round, one ring goes out, and the time left on the
   * open spot and on its tile answers. CSS does the motion (overrides/10-craft.css);
   * reduced motion shows only the new state.
   */
  let beatT = 0;
  function heartbeat(btn: HTMLElement, li: HTMLElement) {
    const heart = btn.closest(".cover")?.querySelector<HTMLElement>("[data-save]") ?? btn;
    const live = heart.closest(".cover")?.querySelector<HTMLElement>(".live");
    for (const el of [heart, live, li]) {
      if (!el) continue;
      el.classList.remove("beat");
      void el.offsetWidth;
      el.classList.add("beat");
    }
    clearTimeout(beatT);
    beatT = window.setTimeout(() => document.querySelectorAll(".beat").forEach((el) => el.classList.remove("beat")), 900);
  }

  function toggleSave(li: HTMLElement, s: FilledSpot, btn: HTMLElement) {
    const on = !isSaved(s);
    if (on)
      SAVES.unshift({
        k: skey(s),
        no: s.no,
        ...(s.num != null && { num: s.num }),
        name: s.name,
        lane: s.lane,
        start: s.start,
        link: s.links?.[0] || null,
        logo: s.logo || null,
        seed: s.seed,
        pal: s.pal,
        savedAt: Date.now(),
        /* "You were #7": on the live wall, where the counts are everyone's */
        ...(live && { rank: (s.saves || 0) + 1, count: (s.saves || 0) + 1 }),
      });
    else SAVES = SAVES.filter((x) => x.k !== skey(s));
    s.saves = Math.max(0, (s.saves || 0) + (on ? 1 : -1));
    ev(s.id, on ? "save" : "unsave");
    persistSaves();
    const from = on && !sheetOn ? li.querySelector(".book")!.getBoundingClientRect() : null;
    if (on && !narrow()) {
      const idx = savesOrder().findIndex((x) => x.k === skey(s));
      if (idx >= savesShown) savesShown = Math.ceil((idx + 1) / 12) * 12;
    }
    renderCard();
    if (on) {
      if (sheetOn) {
        btn.classList.remove("pop");
        void btn.offsetWidth;
        btn.classList.add("pop");
        bumpTab();
      } else flyToCard(li, s, from);
      heartbeat(btn, li);
      scoutNudge(s);
      toast("Kept in your Scouts.");
      writeText("fh-intro", "1");
      dispatchEvent(new Event("fh-intro-done"));
    }
  }

  /** Clicks inside an open view that aren't Save/Share/Next: demo links, the player. */
  function coverClick(e: MouseEvent, s: FilledSpot) {
    const t = e.target as Element;
    const a = t.closest("a[data-demo]");
    if (a) {
      e.preventDefault();
      toast("Demo spot. Real makers link out to their own pages.");
      return true;
    }
    if (t.closest("a[href]")) ev(s.id, "link_click");
    const unavailable = () => toast("Audio isn't available in this browser.");
    const pl = t.closest("[data-play]");
    if (pl) {
      togglePlay(pl.closest<HTMLElement>("[data-player]")!, s, unavailable);
      return true;
    }
    const wv = t.closest("[data-wave]");
    if (wv) {
      const r = wv.getBoundingClientRect();
      startPlay(wv.closest<HTMLElement>("[data-player]")!, s, Math.max(0, Math.min(0.98, (e.clientX - r.left) / r.width)) * 30, unavailable);
      return true;
    }
    return false;
  }

  /* ---------- desktop: one continuous glide, then the panel opens under the row (§6) ---------- */
  const headY = () => $("#top").getBoundingClientRect().bottom + 12;
  const glide = createGlide(reduce, ac.signal);
  const rowOf = (el: Element) => el.closest(".shelf-row");
  const alignY = (el: Element) => scrollY + (rowOf(el) || el).getBoundingClientRect().top - headY() + 4;
  function placeNotch(el: Element, panel: HTMLElement) {
    const b = el.querySelector(".book")!.getBoundingClientRect(),
      p = panel.getBoundingClientRect();
    panel.style.setProperty("--nx", b.left + b.width / 2 - p.left + "px");
  }
  function morphOpen(el: HTMLElement) {
    if (!reduce) morphInto(el, rack, ac.signal);
  }
  /** A spot was opened (panel or sheet): counted once a page view, seen today, its share card printed ahead. */
  function opened(s: FilledSpot) {
    stopAudio();
    if (!OPENED.has(seenKey(s))) {
      OPENED.add(seenKey(s));
      s.opens = (s.opens || 0) + 1;
      ev(s.id, "open");
    }
    markSeen(seenKey(s));
    warmCard(s);
  }
  function swapTo(el: HTMLElement, morph = true) {
    const s = filledOf(el);
    if (el === open) return;
    const before = el.getBoundingClientRect().top;
    opened(s);
    bridge.open(s.no, "panel");
    placeNotch(el, rack.querySelector<HTMLElement>(".panel")!);
    const shift = el.getBoundingClientRect().top - before;
    if (shift) window.scrollTo(0, scrollY + shift);
    if (morph) morphOpen(el);
    open = el;
    try {
      history.replaceState(null, "", addressOf(s));
    } catch {}
    renderCard();
  }
  /** Opens a spot the visitor chose: a tap, Next spot, a Hotspot, a find, or a link to it. Nothing opens by itself. */
  function openSpot(el: HTMLElement | null, { align }: Opts) {
    if (!el || el.classList.contains("vacant") || el.classList.contains("filler")) return;
    if (phoneSheet()) return showSheet(el);
    if (el === open) {
      if (align) glide.to(alignY(el));
      return;
    }
    if (!align) {
      swapTo(el);
      return;
    }
    glide.to(alignY(el), () => swapTo(el));
  }
  const spotFor = (e: Event) => {
    const t = e.target as Element;
    const pnl = t.closest<HTMLElement>(".panel");
    return pnl ? spotEl(noOf(pnl)) : t.closest<HTMLElement>(".spot");
  };
  rack.addEventListener("click", (e) => {
    const el = spotFor(e);
    if (!el || el.classList.contains("filler")) return;
    const t = e.target as Element;
    if (t.closest(".panel")) return coverAction(e, el);
    if (el.classList.contains("vacant")) {
      if (t.closest(".book,.cap")) {
        surface("open_spot_clicked");
        openClaim(noOf(el));
      }
      return;
    }
    if (t.closest(".book,.cap")) {
      if (el === open) return closeSpot();
      openSpot(el, { align: true });
    }
  }, sig);
  function closeSpot() {
    if (sheetOn) return hideSheet();
    if (!open) return;
    stopAudio();
    const el = open;
    const before = el.getBoundingClientRect().top;
    bridge.close();
    open = null;
    const shift = el.getBoundingClientRect().top - before;
    if (shift) window.scrollTo(0, scrollY + shift);
    try {
      history.replaceState(null, "", homeAddress());
    } catch {}
  }
  /** A click inside an open spot (panel or sheet): its player and links, Timeheart, Share, Next spot. */
  function coverAction(e: MouseEvent, el: HTMLElement) {
    const t = e.target as Element;
    const s = filledOf(el);
    if (coverClick(e, s)) return;
    const sv = t.closest<HTMLElement>("[data-save]");
    if (sv) return toggleSave(el, s, sv);
    if (t.closest("[data-share]")) return shareSpot(s);
    if (t.closest("[data-next]")) step(1);
  }
  function step(d: number) {
    let list = [...rack.querySelectorAll<HTMLElement>(".spot:not(.vacant):not(.filler)")];
    if (built < total && open && list.indexOf(open) >= list.length - 3) {
      ensureAll();
      list = [...rack.querySelectorAll<HTMLElement>(".spot:not(.vacant):not(.filler)")];
    }
    if (!list.length) return;
    const i = open ? list.indexOf(open) : -1;
    openSpot(list[Math.max(0, Math.min(list.length - 1, i + d))], { align: true });
  }
  addEventListener("keydown", (e) => {
    if (document.querySelector(".veil.on")) {
      if (e.key === "Escape") closeVeils();
      return;
    }
    if ((e.target as Element).matches("input,textarea")) return;
    if (e.key === "j" || (e.key === "ArrowDown" && e.altKey)) {
      e.preventDefault();
      step(1);
    }
    if (e.key === "k" || (e.key === "ArrowUp" && e.altKey)) {
      e.preventDefault();
      step(-1);
    }
  }, sig);

  /* ---------- the card: fly-to-card, and the phone card behind the tab bar (§10, §11) ---------- */
  let cardOpen = false;
  /* a kept tile flies into the card, or into the tab bar when the card is closed (motion.ts) */
  function flyToCard(li: HTMLElement, s: FilledSpot, from: DOMRect | null) {
    if (narrow() && !cardOpen && from) flyToTab(li, from, reduce);
    else flyIntoCard(li, s, from, reduce, headY());
  }
  function setCard(on: boolean, fromPop = false) {
    if (on && !cardOpen && narrow()) layers.push("card");
    if (on && !cardOpen && ACCOUNT) surface("scout_card_view");
    if (!on && cardOpen && !fromPop) layers.release(["card"]);
    cardOpen = on;
    $("#card").classList.toggle("on", on);
    $("#cardVeil").classList.toggle("on", on);
    document.querySelectorAll<HTMLElement>(".tabbar [data-tab]").forEach((b) => {
      const isOn = (b.dataset.tab === "card") === on && b.dataset.tab !== "create";
      b.classList.toggle("on", isOn);
      if (isOn) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $('[data-tab="card"]').setAttribute("aria-expanded", String(on));
    if (on) $("#card").scrollTop = 0;
  }
  $(".tabbar").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-tab]");
    if (!b) return;
    if (b.dataset.tab === "card") setCard(!cardOpen);
    if (b.dataset.tab === "wall") {
      if (cardOpen) setCard(false);
      else glide.to(0);
    }
    if (b.dataset.tab === "create") {
      setCard(false);
      openClaim();
    }
  }, sig);
  $("#cardVeil").addEventListener("click", () => setCard(false), sig);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cardOpen) setCard(false);
  }, sig);
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (!t.closest("#card")) return;
    const un = t.closest<HTMLElement>("[data-unsave]");
    if (un) {
      e.preventDefault();
      const k = un.dataset.unsave!;
      SAVES = SAVES.filter((y) => y.k !== k);
      persistSaves();
      ev(k, "unsave");
      const cur = WALL.find((w) => !w.vacant && skey(w) === k);
      if (cur && !cur.vacant) {
        cur.saves = Math.max(0, (cur.saves || 0) - 1);
        bridge.refresh();
      }
      renderCard();
      return;
    }
    if (t.closest("[data-more-saves]")) {
      savesShown += 12;
      renderCard();
      return;
    }
    if (t.closest("[data-less-saves]")) {
      savesShown = 12;
      renderCard();
      return;
    }
    if (t.closest("[data-keep]")) {
      /* the Scout explainer on a signed-out card: Start Scouting */
      if (t.closest(".sc-out")) surface("scout_explainer_cta_clicked");
      openKeep();
    }
    if (t.closest("[data-explore]")) exploreWall();
    /* "Keep it 72 more hours": the maker's live spot, same number */
    const ex = t.closest<HTMLButtonElement>("[data-extend]");
    if (ex && !ex.disabled) {
      ex.disabled = true;
      void liveApi.extendSpot(ex.dataset.extend!).then((r) => {
        if (!alive()) return;
        ex.disabled = false;
        if ("error" in r) return toast(r.error);
        const s = WALL.find((w): w is FilledSpot => !w.vacant && w.id === ex.dataset.extend);
        if (s) s.end = Date.parse(r.endsAt);
        renderCard();
        bridge.refresh();
        toast(MAKER.extended);
      });
    }
    /* "Put it on again": the ended story in the Create form, ready to place */
    const ag = t.closest<HTMLElement>("[data-again]");
    if (ag) {
      const e = ENDED.find((x) => x.id === ag.dataset.again);
      if (e) {
        if (cardOpen) setCard(false);
        openClaim(undefined, e);
      }
    }
    if (t.closest("[data-go-scouts]")) document.querySelector("#card .sv-box")?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (t.closest("[data-scout-share]")) openScoutShare();
    if (t.closest("[data-scout-unshare]")) void bridge.actions.scoutShare(false);
    const sc = t.closest<HTMLElement>("[data-share-call]");
    if (sc) openScoutShare(sc.dataset.shareCall);
  }, sig);
  document.addEventListener("click", (e) => {
    const g = (e.target as Element).closest<HTMLElement>("#card [data-go]");
    if (!g) return;
    if (cardOpen) setCard(false);
    const no = +g.dataset.go!;
    let el = spotEl(no);
    if (!el) {
      lane = "all";
      query = "";
      $<HTMLInputElement>("#q").value = "";
      renderLanes();
      renderRack();
      el = spotEl(no);
    }
    if (el) {
      if (el === open) glide.to(alignY(el));
      else openSpot(el, { align: true });
    }
  }, sig);

  /* ---------- phones: the tile comes forward as a sheet (§7) ---------- */
  const phoneSheet = () => matchMedia("(max-width:699px)").matches;
  const dsheet = $("#dsheet"),
    dveil = $("#dveil"),
    dscroll = dsheet.querySelector<HTMLElement>(".dsheet-scroll")!;
  let sheetOn = false,
    sheetPushed = false;
  function fillSheet(s: FilledSpot) {
    const tr = dsheet.style.transform;
    dsheet.setAttribute("style", styleFor(s));
    if (tr) dsheet.style.transform = tr;
    dsheet.dataset.no = String(s.no);
    bridge.fillSheet(s.no);
    dscroll.scrollTop = 0;
    dsheet.setAttribute("aria-label", `${s.name}, ${LANE[s.lane]}, spot ${numOf(s)}`);
  }
  function markOpen(el: HTMLElement) {
    const s = filledOf(el);
    opened(s);
    bridge.open(s.no, "sheet");
    open = el;
    renderCard();
    return s;
  }
  /** Where the overlay starts and ends: the tile, as a transform of the overlay (scaled from its top left). */
  function tileFrame(el: HTMLElement) {
    const t = el.querySelector(".book")!.getBoundingClientRect(),
      r = dsheet.getBoundingClientRect();
    return {
      transform: `translate(${t.left - r.left}px,${t.top - r.top}px) scale(${t.width / r.width})`,
      visible: t.bottom > 0 && t.top < innerHeight,
    };
  }
  const EASE_OPEN = "cubic-bezier(.2,.9,.25,1)";
  /* transform and opacity only, so the phone's compositor runs it */
  function growFrom(el: HTMLElement) {
    const f = tileFrame(el);
    dsheet.style.transformOrigin = "0 0";
    dsheet.animate(
      [
        { transform: f.transform, opacity: 0.35 },
        { transform: f.transform, opacity: 1, offset: 0.12 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 340, easing: EASE_OPEN },
    );
  }
  /** Brings a spot forward as the overlay; `instant` skips growing out of the tile (rotation). */
  function showSheet(el: HTMLElement, instant = false) {
    const s = filledOf(el);
    if (sheetOn) {
      /* next spot: slide the new one in */
      if (el === open) return;
      markOpen(el);
      const out = dscroll.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateX(-28px)" },
        ],
        { duration: reduce ? 0 : 150, easing: "ease-in" },
      );
      out.onfinish = () => {
        fillSheet(s);
        if (!reduce)
          dscroll.animate(
            [
              { opacity: 0, transform: "translateX(28px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
        try {
          history.replaceState(sheetPushed ? { sheet: 1 } : null, "", addressOf(s));
        } catch {}
      };
      return;
    }
    markOpen(el);
    fillSheet(s);
    sheetOn = true;
    dsheet.hidden = false;
    dveil.classList.add("on");
    document.documentElement.classList.add("sheet-lock");
    layers.push("sheet", { sheet: 1 }, addressOf(s));
    sheetPushed = true;
    if (reduce || instant) {
      dsheet.style.transform = "none";
      return;
    }
    /* approved change: the spot itself grows out of its tile into the overlay */
    dsheet.style.transform = "none";
    growFrom(el);
    setTimeout(() => dsheet.querySelector<HTMLElement>(".dclose")?.focus({ preventScroll: true }), 460);
  }
  function hideSheet(fromPop?: boolean) {
    if (!sheetOn) return;
    sheetOn = false;
    stopAudio();
    const el = open;
    if (open) {
      bridge.close();
      open = null;
    }
    dveil.classList.remove("on");
    document.documentElement.classList.remove("sheet-lock");
    const done = () => {
      dsheet.hidden = true;
      dsheet.style.transform = "translateY(105%)";
      bridge.fillSheet(null);
    };
    if (reduce) done();
    else {
      const cur = getComputedStyle(dsheet).transform;
      const f = el && cur === "none" ? tileFrame(el) : null;
      if (f && f.visible)
        /* back into its tile, where you left it */
        dsheet.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: f.transform, opacity: 0.6, offset: 0.8 },
            { transform: f.transform, opacity: 0 },
          ],
          { duration: 240, easing: "cubic-bezier(.4,0,.2,1)" },
        ).onfinish = done;
      /* dragged down, or the tile is out of view: it drops away */
      else
        dsheet.animate([{ transform: cur === "none" ? "none" : cur, opacity: 1 }, { transform: "translateY(60vh)", opacity: 0 }], {
          duration: 240,
          easing: "cubic-bezier(.4,0,.6,1)",
        }).onfinish = done;
    }
    if (sheetPushed && !fromPop) {
      sheetPushed = false;
      layers.release(["sheet"]);
    } else {
      sheetPushed = false;
      try {
        history.replaceState(null, "", homeAddress());
      } catch {}
    }
    /* back where you were: the wall doesn't move while the sheet is up, so
       closing it leaves you at the same place (approved change: the
       reference glided to the last tile and then history.back() undid it) */
    el?.querySelector<HTMLElement>(".book")?.focus({ preventScroll: true });
  }
  addEventListener("popstate", () => {
    const pop = layers.pop();
    if (!pop) return;
    /* Back closes the top layer */
    const { top } = pop;
    if (top === "claimVeil" || top === "shareVeil") {
      const v = $(`#${top}`);
      v.classList.remove("on");
      stopAudio();
      if (!document.querySelector(".veil.on")) document.body.style.overflow = "";
      return;
    }
    if (top === "card") return setCard(false, true);
    if (sheetOn) hideSheet(true);
  }, sig);
  dveil.addEventListener("click", () => hideSheet(), sig);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheetOn) hideSheet();
  }, sig);
  dsheet.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest(".dclose")) return hideSheet();
    const el = spotEl(+dsheet.dataset.no!);
    if (el) coverAction(e, el);
  }, sig);
  installSheetDrag(dsheet, dscroll, dveil, () => hideSheet(), ac.signal);
  /* rotating keeps the open spot open in the form that fits: phone → wide
     hands the sheet over to the inline panel, and (approved change, as the
     brief's §7 asks) wide → phone hands the panel over to the sheet */
  addEventListener("resize", () => {
    if (sheetOn && !phoneSheet()) {
      const el = open;
      hideSheet();
      if (el) swapTo(el, false);
    } else if (!sheetOn && open && phoneSheet()) {
      const el = open;
      bridge.close();
      open = null;
      showSheet(el, true);
    }
  }, sig);

  /* ---------- the minute tick: ageing, time left, expiry ---------- */
  function afterChange(changed: boolean) {
    if (changed) {
      const keep = open ? noOf(open) : null;
      renderRack();
      if (keep) openSpot(spotEl(keep), { align: false });
    } else bridge.tickMinute();
    renderCard();
  }
  every(() => {
    let changed = false;
    WALL.forEach((s, i) => {
      if (!s.vacant && left(s) <= 0) {
        WALL[i] = live ? { no: s.no, vacant: true, lane: s.lane, num: s.num } : { no: s.no, vacant: true };
        changed = true;
      }
    });
    afterChange(changed);
    if (live) refreshFeed();
  }, 60e3);
  /** The live wall follows the database every minute, without reshuffling under the visitor. */
  async function refreshFeed() {
    if (!live) return;
    try {
      live.feed = await liveApi.fetchFeed();
      if (!alive()) return;
      bridge.setHot(live.feed.hot ?? null);
    } catch {
      return;
    }
    /* never swap spots out from under an open phone sheet or form */
    if (sheetOn || document.querySelector(".veil.on")) return;
    const changed = mergeFeed(WALL, live.feed, live.base, liveApi.mineIds());
    if (changed) afterChange(true);
    else bridge.refresh();
  }

  /* ---------- sharing (§15) and Keep my card (§12) ---------- */
  const spotURL = (s: FilledSpot) => (live ? location.origin + addressOf(s) : location.href.split("#")[0] + "#" + pad(s.no));
  /**
   * Share: where the phone can share files, the spot's card and its link go
   * straight to the native share sheet (the card is printed ahead, while the
   * spot is open); otherwise, and when that fails, our share sheet.
   */
  async function shareSpot(s: FilledSpot) {
    const data: ShareData = {
      title: `${s.name} on fivehundrd.`,
      text: `${s.name} is on spot ${pad(numOf(s))} of 500. Gone in ${short(left(s))}.`,
      url: spotURL(s),
    };
    ev(s.id, "share");
    if (navigator.share) {
      const blob = readyCard(s, data.url, "story");
      const file = blob && new File([blob], cardFileName(s, "story"), { type: "image/png" });
      try {
        if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: data.title, text: `${data.text} ${data.url}` });
        else await navigator.share(data);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    bridge.openShare({ kind: "share", data, spot: s });
    showVeil("shareVeil");
  }
  /** Prints the open spot's story card in the background, so Share can hand it over at once. */
  let warmT: ReturnType<typeof setTimeout> | undefined;
  function warmCard(s: FilledSpot) {
    clearTimeout(warmT);
    if (!navigator.canShare) return;
    warmT = setTimeout(() => void shareCardBlob(s, spotURL(s), "story").catch(() => {}), 700);
  }
  /** Explore the Wall: the card out of the way, the wall right under the header. */
  function exploreWall() {
    if (cardOpen) setCard(false);
    const sl = document.querySelector<HTMLElement>(".spotlight");
    const to = sl && sl.offsetParent ? sl : rack;
    glide.to(scrollY + to.getBoundingClientRect().top - $("#top").getBoundingClientRect().bottom);
  }
  /** The Scout Card's share sheet; with `story`, one Early Call from it. */
  function openScoutShare(story?: string) {
    if (!SCOUT) return;
    if (cardOpen) setCard(false);
    const call = story ? SCOUT.list.find((c) => c.id === story) ?? (SCOUT.best?.id === story ? SCOUT.best : undefined) : undefined;
    surface(story ? "scout_call_share" : "scout_card_share", story);
    bridge.openShare({ kind: "scout", me: SCOUT, call, base: `${location.origin}/scout/` });
    showVeil("shareVeil");
  }
  function openKeep() {
    /* approved change: on phones the card is a sheet above the veil, so the
       login sheet opened behind it; close the card first, as Create does */
    if (cardOpen) setCard(false);
    bridge.openShare({ kind: "keep" });
    showVeil("shareVeil");
  }
  /** Shows #claimVeil or #shareVeil (with its own history entry on phones). */
  function showVeil(id: "claimVeil" | "shareVeil") {
    const v = $(`#${id}`);
    if (!v.classList.contains("on") && narrow()) layers.push(id);
    v.classList.add("on");
  }
  function closeVeils(fromPop = false) {
    stopAudio();
    const open = [...document.querySelectorAll<HTMLElement>(".veil.on")].map((v) => v.id);
    document.querySelectorAll(".veil").forEach((v) => v.classList.remove("on"));
    document.body.style.overflow = "";
    if (!fromPop) layers.release(open);
  }
  document.querySelectorAll(".veil").forEach((v) =>
    v.addEventListener("click", (e) => {
      if (e.target === v || (e.target as Element).closest("[data-close]")) closeVeils();
    }, sig),
  );
  const toast = (m: string) => bridge.toast(m);

  /* ---------- claiming a spot (§13) ---------- */
  /** An open number: a place on the demo wall, or a number in `L` on the live wall. */
  function randomVacant(L?: LaneId) {
    if (live) {
      const nums = openNumbers(live.feed, L ?? (lane === "all" ? "music" : lane));
      return nums.length ? nums[Math.floor(Math.random() * nums.length)] : null;
    }
    const v = WALL.filter((s) => s.vacant);
    return v.length ? v[Math.floor(Math.random() * v.length)].no : null;
  }
  /** Switching lanes in the form keeps the number if it is open in the new lane. */
  function numberFor(L: LaneId, n: number) {
    if (!live) return n;
    return openNumbers(live.feed, L).includes(n) ? n : (randomVacant(L) ?? n);
  }
  /** Create your story; `again`: an ended story of this maker's, put on again (its old number if that's open). */
  function openClaim(no?: number, again?: EndedStory) {
    const at = live && no ? WALL[no - 1] : null;
    const L: LaneId = again ? again.lane : at && at.lane ? at.lane : lane === "all" ? "music" : (lane as LaneId);
    const n = again
      ? (live && sameNumber(again, openNumbers(live.feed, L))) || randomVacant(L)
      : live
        ? (at && at.vacant && at.num) || randomVacant(L)
        : no || randomVacant();
    if (!n) {
      toast(live ? `Every ${LANE[L]} spot is taken. Check back soon.` : "All 500 spots are taken. Check back soon.");
      return;
    }
    createMoment();
    bridge.openClaim(
      again
        ? { no: n, lane: L, seed: again.seed, pal: PAL[again.pal] ?? PAL[0], prefill: prefillFrom(again, live?.base ?? "") }
        : { no: n, lane: L, seed: Math.floor(Math.random() * 1e9), pal: PAL[Math.floor(Math.random() * PAL.length)] },
    );
    showVeil("claimVeil");
    document.body.style.overflow = "hidden";
  }
  function placeClaim(draft: Draft): string | null | Promise<string | null> {
    surface("creator_place_clicked", undefined, { lane: draft.lane });
    /* the live wall holds the spot and sends the maker to Stripe Checkout */
    if (live) return liveApi.checkout(draft);
    if (!WALL[draft.no - 1].vacant) {
      const n = randomVacant();
      if (!n) return "Someone just took the last spot.";
      draft.no = n;
    }
    setTimeout(() => {
      if (!alive()) return;
      const L = draft.lane;
      const s: FilledSpot = {
        no: draft.no,
        lane: L,
        name: draft.name,
        snippet: draft.snippet || "New on the wall.",
        links: draft.links,
        img: draft.img,
        logo: draft.logo,
        seed: draft.seed,
        pal: draft.pal,
        start: Date.now(),
        mine: true,
        opens: 0,
        saves: 0,
        audio: L === "music" || L === "podcasts" ? draft.audio : null,
        excerpt: (L === "writers" || L === "letters") && draft.excerpt?.x ? draft.excerpt : null,
        trailer: L === "art" || L === "games" ? draft.trailer : null,
      };
      WALL[s.no - 1] = s;
      const mine = read<FilledSpot[]>("fh-claims", []);
      write("fh-claims", [...(Array.isArray(mine) ? mine : []).filter((m) => m.no !== s.no), s]);
      if (lane !== "all" && lane !== s.lane) {
        lane = "all";
        renderLanes();
      }
      renderRack();
      bridge.claimDone(s);
    }, 900);
    return null;
  }
  $("#claimTop").onclick = () => openClaim();

  /* ---------- what React asks for ---------- */
  /** Logged in (live wall): the account's saves join this browser's, and the card says it is kept. */
  async function syncAccount() {
    const acc = await liveApi.syncCard().catch(() => null);
    if (!acc || !live || !alive()) return;
    ACCOUNT = { via: acc.via, remind: acc.remind };
    const have = new Set(SAVES.map((x) => x.k));
    for (const a of acc.saves) {
      if (have.has(a.id)) continue;
      const cur = WALL.find((w) => !w.vacant && w.id === a.id);
      SAVES.push({
        k: a.id,
        no: cur ? cur.no : 0,
        num: a.no,
        name: a.name,
        lane: a.lane as LaneId,
        start: Date.parse(a.startsAt),
        link: a.link,
        logo: mediaURL(live.base, "art", a.logo),
        img: mediaURL(live.base, "art", a.artwork),
        seed: a.seed,
        pal: PAL[a.pal] ?? PAL[0],
        savedAt: Date.parse(a.savedAt),
      });
    }
    SAVES.sort((x, y) => y.savedAt - x.savedAt);
    persistSaves();
    renderCard();
    /* signed in: the account's live and ended stories too, from any device */
    void loadMakerStats();
    void loadEnded();
    /* Scout: this browser's history joins the account; the Timeheart that led here can still count */
    const pending = read<{ id: string; at: number } | null>(PENDING_KEY, null);
    drop(PENDING_KEY);
    const story = pending && Date.now() - pending.at < 30 * 60e3 ? pending.id : undefined;
    const r = await liveApi.scoutAttach(story);
    if (!alive()) return;
    if (r && (story || liveApi.justSignedIn())) surface("scout_signed_in", story, { from: story ? "timeheart" : "card", counted: r.counted, migrated: r.migrated });
    await loadScout();
  }

  Object.assign(bridge.actions, {
    keepCard(via: string, remind: boolean, byEmail: boolean) {
      if (live) {
        liveApi.signIn(via, REMINDERS && remind).then((err) => {
          if (err) return toast(err);
          if (byEmail) {
            closeVeils();
            toast("Check your inbox for the link.");
          }
        });
        return;
      }
      ACCOUNT = { via, remind };
      write("fh-account", ACCOUNT);
      closeVeils();
      SCOUT = demoScout();
      renderCard();
      toast(byEmail ? "Check your inbox for the link. You're a Scout." : "You're a Scout. From now on, Fivehundrd remembers when you found things.");
    },
    randomVacant,
    numberFor,
    placeClaim,
    previewClick: (e: MouseEvent, p: FilledSpot) => coverClick(e, p),
    share: (s: FilledSpot) => shareSpot(s),
    shareSheet(s: FilledSpot) {
      bridge.openShare({
        kind: "share",
        data: { title: `${s.name} on fivehundrd.`, text: `${s.name} is on spot ${pad(numOf(s))} of 500.`, url: spotURL(s) },
        spot: s,
      });
      showVeil("shareVeil");
    },
    spotURL,
    seeOnWall(no: number) {
      closeVeils();
      openSpot(spotEl(no), { align: true });
    },
    openHot(no: number, from?: "hot" | "new" | "since") {
      const s = WALL[no - 1];
      if (from && s && !s.vacant) surface(from === "hot" ? "hot_tap" : from === "new" ? "new_tap" : "since_tap", s.id);
      /* not on this lane or search: back to the whole wall first */
      if (!rack.querySelector(`[data-no="${no}"]`) && !spotEl(no)) {
        wholeWall();
      }
      openSpot(spotEl(no), { align: true });
    },
    /** Finds, from "since your last visit" when what changed is more than one spot. */
    openFinds() {
      surface("since_tap");
      if (narrow()) setCard(true);
      else window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    },
    scoutSignIn(story?: string) {
      if (story) write(PENDING_KEY, { id: story, at: Date.now() });
      bridge.setScoutNudge(null);
      surface("scout_prompt_tap", story);
      openKeep();
    },
    scoutNudgeClosed() {
      bridge.setScoutNudge(null);
    },
    heroCta() {
      surface("live_proof_creator_cta_clicked");
      openClaim();
    },
    scoutMoveSeen() {
      surface("scout_move_seen");
    },
    async scoutShare(on: boolean, name?: string, fresh?: boolean) {
      if (!live) return { error: "Sharing your Scout Card works on the live wall." };
      const r = await liveApi.scoutShare(on, name, fresh);
      if (!r) return { error: "That didn't work. Try again." };
      if (SCOUT) SCOUT = { ...SCOUT, share: r.slug, ...(name && { name }) };
      renderCard();
      if (!on) toast("Your Scout Card is private again.");
      return { url: r.slug ? scoutURL(r.slug) : null };
    },
  } satisfies Bridge["actions"]);

  /* ---------- since your last visit: one thing that changed for you ---------- */
  let SINCE_AT: number | null = null,
    sinceSent = false,
    breakoutSent = false;
  /** `final`: the Finds' history is in (or won't come); measured once a visit. */
  function refreshSince(final: boolean) {
    if (SINCE_AT == null) return;
    const item = personalItem({ saves: savesOrder(), prior: PRIOR, finds: FINDS, since: SINCE_AT, wall: WALL, scout: ACCOUNT ? SCOUT?.list : undefined });
    /* the live wall keeps 10% without it, to measure what it changes */
    const holdout = !!live && inHoldout(visitorId());
    bridge.setSinceItem(holdout ? null : item);
    if (live && !holdout && item?.kind === "breakout" && !breakoutSent) {
      breakoutSent = true;
      surface("scout_breakout_seen", item.story);
    }
    if (final && live && !sinceSent) {
      sinceSent = true;
      surface("since_shown", item?.story, { item: item?.kind ?? "none", holdout });
    }
  }
  /** "Your story": the maker's own numbers (live wall), on load and every few minutes. */
  let MAKERS: Record<string, MakerNumbers> = {};
  async function loadMakerStats() {
    const ids = [...liveApi.mineIds()];
    if (!ids.length && !ACCOUNT) return;
    const r = await liveApi.makerStats(ids);
    if (!r || !alive()) return;
    MAKERS = Object.fromEntries(r.map((m) => [m.id, m]));
    /* signed in: the account's live spots from another device are this maker's too */
    for (const m of r)
      if (!liveApi.mineIds().has(m.id)) {
        liveApi.addMine(m.id);
        const s = WALL.find((w): w is FilledSpot => !w.vacant && w.id === m.id);
        if (s) s.mine = true;
      }
    renderCard();
  }
  /** "Your story" after its 72 hours: the final numbers and "Put it on again" (this browser's stories, or the account's). */
  let ENDED: EndedStory[] = [];
  async function loadEnded() {
    const r = await liveApi.makerEnded([...liveApi.mineIds()]);
    if (!r || !alive()) return;
    ENDED = r;
    renderCard();
  }
  /** The Finds' history from the database (live wall): once a visit, and after a call. */
  async function loadFinds() {
    const ids = SAVES.map((x) => x.k);
    const r = ids.length ? await liveApi.findsStatus(ids) : [];
    if (!alive()) return;
    if (r) {
      FINDS = Object.fromEntries(r.map((f) => [f.id, f]));
      write("fh-finds", FINDS);
      renderCard();
    }
    refreshSince(true);
  }

  /* ---------- boot ---------- */
  /* the card says "Finds" on phones and tablets */
  matchMedia("(max-width:979px)").addEventListener("change", () => renderCard(), sig);
  matchMedia("(max-width:699px)").addEventListener("change", (e) => bridge.setCompact(e.matches), sig);
  const setHead = () => alive() && document.documentElement.style.setProperty("--headY", $("#top").getBoundingClientRect().bottom + 12 + "px");
  /* what changed since the last visit (a new visit after 30 minutes away) */
  try {
    const r = sinceLastVisit(read<VisitMemory | null>("fh-visits", null), WALL, Date.now());
    write("fh-visits", r.mem);
    bridge.setSince(r.since);
    SINCE_AT = r.since?.at ?? null;
    renderCard();
    refreshSince(!live);
    /* staying keeps it the same visit */
    every(() => {
      if (document.hidden) return;
      const m = read<VisitMemory | null>("fh-visits", null);
      if (m) write("fh-visits", { ...m, active: Date.now() });
    }, 60e3);
  } catch {}
  if (live) bridge.setHot(live.feed.hot ?? []);
  renderLanes();
  renderRack();
  /* read in the next frame, when the page is laid out anyway: reading it now forced a layout of the whole page, a fifth of a second on a slow phone */
  requestAnimationFrame(setHead);
  /* "Claim a spot" from another page */
  if (new URLSearchParams(location.search).get("create") === "1") {
    try {
      history.replaceState(null, "", location.pathname);
    } catch {}
    requestAnimationFrame(() => alive() && openClaim());
  }
  addEventListener("resize", setHead, sig);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(setHead);
  if (live) {
    bootLive();
    syncAccount();
    loadFinds();
    loadMakerStats();
    loadEnded();
    every(() => {
      if (document.hidden) return;
      loadMakerStats();
      loadEnded();
    }, 5 * 60e3);
    return stop;
  }
  if (ACCOUNT) void loadScout();
  /* a link to a spot (#217) opens it; otherwise the wall starts with nothing open */
  const h = location.hash.replace("#", "");
  /* in the next frame: the wall's start is rendered in one go when this returns */
  if (/^\d{1,3}$/.test(h))
    requestAnimationFrame(() => {
      const linked = alive() && spotEl(+h);
      if (linked) openSpot(linked, { align: true });
    });
  return stop;

  /* ---------- the live wall: shared links, and coming back from Checkout ---------- */
  function bootLive() {
    const q = new URLSearchParams(location.search);
    const claimed = q.get("claimed"),
      cancelled = q.get("cancelled");
    /* /s/music/217/k3f9x2ab (the lasting link) or /s/music/217 (whoever holds it now) */
    const m = location.pathname.match(/^\/s\/([a-z]+)\/(\d+)(?:\/([a-z0-9]{8}))?\/?$/);
    const shared = m
      ? WALL.find((s): s is FilledSpot => !s.vacant && (m[3] ? s.slug === m[3] : s.lane === m[1] && numOf(s) === +m[2]))
      : undefined;
    if (m && !shared) {
      toast("That story has left the wall. Here's who's on it now.");
      history.replaceState(null, "", "/");
    }
    if (claimed || cancelled) history.replaceState(null, "", "/");
    /* a shared link opens its story; otherwise nothing opens until someone taps */
    if (shared)
      requestAnimationFrame(() => {
        if (!alive()) return;
        openSpot(spotEl(shared.no), { align: true });
        ev(shared.id, "entry");
      });
    if (claimed) afterCheckout(claimed);
    /* "Get your own spot" from a story's lasting link */
    if (q.get("create") === "1") {
      history.replaceState(null, "", "/");
      /* in the next frame, once the wall's start is rendered: the form sizes its preview from a wall tile */
      requestAnimationFrame(() => alive() && openClaim());
    }
    if (cancelled)
      liveApi.cancelCheckout(cancelled).then(() => {
        if (!alive()) return;
        toast("Checkout cancelled. Nothing was charged.");
        refreshFeed();
      });
  }
  /** Back from Stripe: wait for the payment to land, then show the maker their spot. */
  async function afterCheckout(id: string) {
    liveApi.addMine(id);
    for (let i = 0; i < 20; i++) {
      const st = await liveApi.checkoutStatus(id).catch(() => null);
      if (!alive()) return;
      if (st?.status === "live") {
        await refreshFeed();
        const s = WALL.find((w): w is FilledSpot => !w.vacant && w.id === id);
        if (s) {
          s.mine = true;
          if (lane !== "all" && lane !== s.lane) {
            lane = "all";
            renderLanes();
            renderRack();
          }
          renderCard();
          bridge.claimDone(s);
          showVeil("claimVeil");
          document.body.style.overflow = "hidden";
        }
        return;
      }
      if (!st || st.status === "vacant" || st.status === "released") break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    toast(CREATE.confirming);
  }
}
