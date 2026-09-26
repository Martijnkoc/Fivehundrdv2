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
import { PAL, seedWall } from "../../lib/wall/demo";
import { buildLiveWall, mergeFeed, openNumbers, type Feed } from "../../lib/wall/live";
import { LANE, LIFE, numOf, pad, seenKey, type FilledSpot, type LaneId, type NavId, type Spot } from "../../lib/wall/model";
import { buildRack } from "../../lib/wall/rack";
import { savesOrder as savesOrderOf, skey, type SaveEntry } from "../../lib/wall/saves";
import { left, short, styleFor } from "../../lib/wall/time";
import { startPlay, stopAudio, togglePlay } from "./audio";
import type { Account } from "./Card";
import type { Draft } from "./Claim";
import type { ShareData } from "./Sheets";
import type { Bridge } from "./store";
import * as liveApi from "./liveClient";

type Opts = { align: boolean; auto?: boolean };
/** The live wall (Supabase): the feed it was built from and the storage base URL. */
export type Live = { feed: Feed; base: string };

export function startWall(bridge: Bridge, live?: Live) {
  const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spotEl = (no: number) => document.getElementById("s-" + pad(no));
  const noOf = (el: Element) => +(el as HTMLElement).dataset.no!;
  const filledOf = (el: Element) => WALL[noOf(el) - 1] as FilledSpot;

  /* ---------- the wall: live stories, or demo data plus this browser's own claims ---------- */
  const WALL: Spot[] = live ? buildLiveWall(live.feed, live.base, liveApi.mineIds()) : seedWall();
  if (!live)
    try {
      const mine: FilledSpot[] = JSON.parse(localStorage.getItem("fh-claims") || "[]");
      mine.forEach((s) => {
        if (Date.now() - s.start < LIFE) WALL[s.no - 1] = s;
      });
    } catch {}
  bridge.setWall(WALL);
  /** Counts an open, save, share… on the live wall. */
  const ev = (id: string | undefined, kind: liveApi.EventKind) => {
    if (live && id) liveApi.sendEvent(id, kind);
  };
  /** A spot's address: /s/music/217 on the live wall, #217 on the demo wall. */
  const addressOf = (s: FilledSpot) => (live ? `/s/${s.lane}/${numOf(s)}` : "#" + pad(s.no));
  const homeAddress = () => (live ? "/" : location.pathname + location.search);

  /* ---------- lanes and search (§9) ---------- */
  let lane: NavId = "all";
  const renderLanes = () => bridge.setLane(lane);
  function setLane(k: NavId) {
    lane = k;
    renderLanes();
    renderRack();
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      const f = document.querySelector(".spot:not(.vacant):not(.filler)");
      if (f) openSpot(f as HTMLElement, { align: false, auto: true });
    });
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
      $<HTMLInputElement>("#q").value = "";
      query = "";
      setLane("all");
    }
  });
  let query = "",
    qT: ReturnType<typeof setTimeout> | undefined;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => {
      query = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderRack();
      window.scrollTo({ top: 0 });
      const f = document.querySelector(".spot:not(.vacant):not(.filler)");
      if (query && f) openSpot(f as HTMLElement, { align: false, auto: true });
    }, 140);
  });

  /* ---------- the rack (§5, §6) ---------- */
  const rack = $("#rack");
  let open: HTMLElement | null = null;
  /* one entry point per visitor per day, kept in the browser (a cookie in the real build) */
  let ENTRY_R = Math.random(),
    entryNo = 1;
  try {
    const today = new Date().toISOString().slice(0, 10),
      e = JSON.parse(localStorage.getItem("fh-entry") || "null");
    if (e && e.day === today) ENTRY_R = e.r;
    else localStorage.setItem("fh-entry", JSON.stringify({ day: today, r: ENTRY_R }));
  } catch {}
  let COLS = 5;
  const colsNow = () => {
    const w = rack.clientWidth || rack.parentElement!.clientWidth;
    return w < 430 ? 3 : w < 640 ? 4 : 5;
  };
  addEventListener("resize", () => {
    if (colsNow() !== COLS) {
      const keep = open ? noOf(open) : null;
      renderRack();
      if (keep) {
        const el = spotEl(keep);
        if (el) swapTo(el);
      }
    }
  });
  function renderRack() {
    open = null;
    const C = (COLS = colsNow());
    const r = buildRack({ wall: WALL, lane, query, cols: C, entryR: ENTRY_R });
    entryNo = r.entryNo;
    bridge.renderRack(r);
    renderCard();
  }

  /* ---------- the visitor: saves (§11), seen today, account (§12) ---------- */
  let SAVES: SaveEntry[] = [];
  try {
    SAVES = JSON.parse(localStorage.getItem("fh-saves") || "[]");
  } catch {}
  bridge.setSaved(SAVES.map((x) => x.k));
  const isSaved = (s: FilledSpot) => SAVES.some((x) => x.k === skey(s));
  function persistSaves() {
    try {
      localStorage.setItem("fh-saves", JSON.stringify(SAVES));
    } catch {}
    bridge.setSaved(SAVES.map((x) => x.k));
  }
  let ACCOUNT: Account | null = null;
  try {
    ACCOUNT = JSON.parse(localStorage.getItem("fh-account") || "null");
  } catch {}
  let savesShown = 12;
  const OPENED = new Set<string | number>();
  const TODAY = new Date().toISOString().slice(0, 10);
  let SEEN = new Set<string | number>();
  try {
    const d = JSON.parse(localStorage.getItem("fh-seen") || "null");
    if (d && d.day === TODAY) SEEN = new Set(d.nos);
  } catch {}
  function markSeen(no: string | number) {
    if (SEEN.has(no)) return;
    SEEN.add(no);
    try {
      localStorage.setItem("fh-seen", JSON.stringify({ day: TODAY, nos: [...SEEN] }));
    } catch {}
  }
  const savesOrder = () => savesOrderOf(SAVES, WALL);
  function renderCard() {
    bridge.setCard({
      entryNo,
      ...(live && WALL[entryNo - 1] && { entryNum: numOf(WALL[entryNo - 1]) }),
      seen: new Set(SEEN),
      saves: [...SAVES],
      savesShown,
      account: ACCOUNT,
    });
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
      });
    else SAVES = SAVES.filter((x) => x.k !== skey(s));
    s.saves = Math.max(0, (s.saves || 0) + (on ? 1 : -1));
    ev(s.id, on ? "save" : "unsave");
    persistSaves();
    const from = on && !sheetOn ? li.querySelector(".book")!.getBoundingClientRect() : null;
    if (on && !mobileCard()) {
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
      toast("Saved to your Fivehundrd card.");
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
  let tween = 0,
    tweenDone: (() => void) | null = null;
  function cancelTween(finish: boolean) {
    if (!tween) return;
    cancelAnimationFrame(tween);
    tween = 0;
    const d = tweenDone;
    tweenDone = null;
    if (finish && d) d();
  }
  function glideTo(y: number, done?: () => void) {
    cancelTween(true);
    const max = document.documentElement.scrollHeight - innerHeight;
    y = Math.max(0, Math.min(max, y));
    const from = scrollY,
      dist = y - from;
    if (Math.abs(dist) < 2 || reduce) {
      window.scrollTo(0, y);
      done?.();
      return;
    }
    const dur = Math.min(420, Math.max(180, Math.abs(dist) * 0.32));
    let t0 = 0;
    tweenDone = done ?? null;
    const f = (now: number) => {
      if (!t0) t0 = now - 16;
      const t = Math.max(0, Math.min(1, (now - t0) / dur)),
        e = 1 - Math.pow(1 - t, 3);
      window.scrollTo(0, from + dist * e);
      if (t < 1) tween = requestAnimationFrame(f);
      else {
        tween = 0;
        const d = tweenDone;
        tweenDone = null;
        d?.();
      }
    };
    tween = requestAnimationFrame(f);
  }
  ["wheel", "touchstart"].forEach((ev) => addEventListener(ev, () => cancelTween(true), { passive: true }));
  const rowOf = (el: Element) => el.closest(".shelf-row");
  const alignY = (el: Element) => scrollY + (rowOf(el) || el).getBoundingClientRect().top - headY() + 4;
  function placeNotch(el: Element, panel: HTMLElement) {
    const b = el.querySelector(".book")!.getBoundingClientRect(),
      p = panel.getBoundingClientRect();
    panel.style.setProperty("--nx", b.left + b.width / 2 - p.left + "px");
  }
  function swapTo(el: HTMLElement) {
    const s = filledOf(el);
    if (el === open) return;
    const before = el.getBoundingClientRect().top;
    stopAudio();
    if (!OPENED.has(seenKey(s))) {
      OPENED.add(seenKey(s));
      s.opens = (s.opens || 0) + 1;
      ev(s.id, "open");
    }
    markSeen(seenKey(s));
    bridge.open(s.no, "panel");
    placeNotch(el, rack.querySelector<HTMLElement>(".panel")!);
    const shift = el.getBoundingClientRect().top - before;
    if (shift) window.scrollTo(0, scrollY + shift);
    open = el;
    try {
      history.replaceState(null, "", addressOf(s));
    } catch {}
    renderCard();
  }
  function openSpot(el: HTMLElement | null, { align, auto }: Opts) {
    if (!el || el.classList.contains("vacant") || el.classList.contains("filler")) return;
    if (phoneSheet()) {
      if (auto) return;
      return showSheet(el);
    }
    if (el === open) {
      if (align) glideTo(alignY(el));
      return;
    }
    if (!align) {
      swapTo(el);
      return;
    }
    glideTo(alignY(el), () => swapTo(el));
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
    if (t.closest(".panel")) {
      const s = filledOf(el);
      if (coverClick(e, s)) return;
      const sv = t.closest<HTMLElement>("[data-save]");
      if (sv) return toggleSave(el, s, sv);
      if (t.closest("[data-share]")) return shareSpot(s);
      if (t.closest("[data-next]")) return step(1);
      return;
    }
    if (el.classList.contains("vacant")) {
      if (t.closest(".book,.cap")) openClaim(noOf(el));
      return;
    }
    if (t.closest(".book,.cap")) {
      if (el === open) return closeSpot();
      openSpot(el, { align: true });
    }
  });
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
  function step(d: number) {
    const list = [...rack.querySelectorAll<HTMLElement>(".spot:not(.vacant):not(.filler)")];
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
  });

  /* ---------- the card: fly-to-card, and the phone card behind the tab bar (§10, §11) ---------- */
  const mobileCard = () => matchMedia("(max-width:979px)").matches;
  let cardOpen = false;
  function bumpTab() {
    const n = document.getElementById("tbN");
    if (!n) return;
    n.classList.remove("pop");
    void n.offsetWidth;
    n.classList.add("pop");
  }
  function ghostBook(li: HTMLElement, from: DOMRect) {
    const g = document.createElement("div");
    g.className = "flyer";
    g.setAttribute("style", li.getAttribute("style") + `;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`);
    const b = li.querySelector(".book")!.cloneNode(true) as HTMLElement;
    b.style.cssText = "width:100%;height:100%;transform:none;aspect-ratio:auto";
    g.appendChild(b);
    document.body.appendChild(g);
    return g;
  }
  function flyToTab(li: HTMLElement, from: DOMRect) {
    const tab = document.querySelector('[data-tab="card"] .tb-ic');
    if (!tab || reduce) {
      bumpTab();
      return;
    }
    const to = tab.getBoundingClientRect(),
      k = Math.max(0.12, (to.height * 1.3) / from.height);
    const g = ghostBook(li, from),
      dx = to.left + to.width / 2 - from.left - (from.width * k) / 2,
      dy = to.top - from.top - 4;
    const a = g.animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1, transformOrigin: "0 0" },
        { transform: `translate(${dx * 0.4}px,${dy * 0.4 - 60}px) scale(${(1 + k) / 2}) rotate(-8deg)`, opacity: 1, offset: 0.45, transformOrigin: "0 0" },
        { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(0)`, opacity: 0.3, transformOrigin: "0 0" },
      ],
      { duration: 620, easing: "cubic-bezier(.3,.7,.2,1)" },
    );
    const done = () => {
      g.remove();
      bumpTab();
    };
    a.onfinish = done;
    a.oncancel = done;
  }
  function flyToCard(li: HTMLElement, s: FilledSpot, from: DOMRect | null) {
    if (mobileCard() && !cardOpen && from) {
      flyToTab(li, from);
      return;
    }
    const target = document.querySelector<HTMLElement>(`#card .msp[data-k="${skey(s)}"]`);
    if (!target || !from) return;
    if (reduce) {
      target.classList.add("landed");
      return;
    }
    const to = target.querySelector(".sq")!.getBoundingClientRect();
    const visible = to.bottom > headY() && to.top < innerHeight,
      k = Math.max(0.15, (to.height * 1.25) / from.height);
    const g = ghostBook(li, from),
      dx = to.left + 10 - from.left,
      dy = (visible ? to.top - 4 : headY() - from.height * k) - from.top;
    target.classList.add("landing");
    const a = g.animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1, transformOrigin: "0 0" },
        { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 50}px) scale(${(1 + k) / 2}) rotate(-6deg)`, opacity: 1, offset: 0.45, transformOrigin: "0 0" },
        { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(0)`, opacity: 0, transformOrigin: "0 0" },
      ],
      { duration: 640, easing: "cubic-bezier(.3,.7,.2,1)" },
    );
    const done = () => {
      g.remove();
      target.classList.remove("landing");
      target.classList.add("landed");
    };
    a.onfinish = done;
    a.oncancel = done;
  }
  function setCard(on: boolean) {
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
      else glideTo(0);
    }
    if (b.dataset.tab === "create") {
      setCard(false);
      openClaim();
    }
  });
  $("#cardVeil").addEventListener("click", () => setCard(false));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cardOpen) setCard(false);
  });
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
    if (t.closest("[data-keep]")) openKeep();
  });
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
      if (el === open) glideTo(alignY(el));
      else openSpot(el, { align: true });
    }
  });

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
    stopAudio();
    if (!OPENED.has(seenKey(s))) {
      OPENED.add(seenKey(s));
      s.opens = (s.opens || 0) + 1;
      ev(s.id, "open");
    }
    markSeen(seenKey(s));
    bridge.open(s.no, "sheet");
    open = el;
    renderCard();
    return s;
  }
  /** Brings a spot forward as the sheet; `instant` skips the rise and ghost (rotation). */
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
    const from = el.querySelector(".bk-art")!.getBoundingClientRect();
    markOpen(el);
    fillSheet(s);
    sheetOn = true;
    dsheet.hidden = false;
    dveil.classList.add("on");
    document.documentElement.classList.add("sheet-lock");
    try {
      history.pushState({ sheet: 1 }, "", addressOf(s));
      sheetPushed = true;
    } catch {
      sheetPushed = false;
    }
    if (reduce || instant) {
      dsheet.style.transform = "none";
      return;
    }
    /* the tile's artwork travels up into the sheet while the sheet rises */
    dsheet.style.transform = "none";
    const art = dscroll.querySelector<HTMLElement>(".art")!,
      to = art.getBoundingClientRect();
    const g = document.createElement("div");
    g.className = "flyer art-ghost";
    g.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;border-radius:12px;overflow:hidden`;
    g.innerHTML = el.querySelector(".bk-art")!.innerHTML;
    document.body.appendChild(g);
    art.style.visibility = "hidden";
    const sx = from.width / to.width,
      sy = from.height / to.height;
    g.animate(
      [
        { transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${sx},${sy})`, borderRadius: "6px" },
        { transform: "none", borderRadius: "12px" },
      ],
      { duration: 440, easing: "cubic-bezier(.2,.9,.25,1)", fill: "both" },
    ).onfinish = () => {
      art.style.visibility = "";
      g.remove();
    };
    dsheet.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 440, easing: "cubic-bezier(.2,.9,.25,1)" });
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
      dsheet.animate([{ transform: cur === "none" ? "none" : cur }, { transform: "translateY(105%)" }], {
        duration: 280,
        easing: "cubic-bezier(.4,0,.6,1)",
      }).onfinish = done;
    }
    if (sheetPushed && !fromPop) {
      sheetPushed = false;
      try {
        history.back();
      } catch {}
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
    if (sheetOn) hideSheet(true);
  });
  dveil.addEventListener("click", () => hideSheet());
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheetOn) hideSheet();
  });
  dsheet.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest(".dclose")) return hideSheet();
    const el = spotEl(+dsheet.dataset.no!);
    if (!el) return;
    const s = filledOf(el);
    if (coverClick(e, s)) return;
    const sv = t.closest<HTMLElement>("[data-save]");
    if (sv) return toggleSave(el, s, sv);
    if (t.closest("[data-share]")) return shareSpot(s);
    if (t.closest("[data-next]")) return step(1);
  });
  /* pull the sheet down to put it away: past 120px, or a fast flick */
  {
    let y0 = 0,
      dy = 0,
      drag = false,
      t0 = 0;
    const start = (e: TouchEvent) => {
      if (dscroll.scrollTop > 0 && !(e.target as Element).closest(".grab")) return;
      drag = true;
      y0 = e.touches[0].clientY;
      dy = 0;
      t0 = performance.now();
      dsheet.style.transition = "none";
    };
    const move = (e: TouchEvent) => {
      if (!drag) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0 && dscroll.scrollTop <= 0) {
        e.preventDefault();
        dsheet.style.transform = `translateY(${dy}px)`;
        dveil.style.opacity = String(Math.max(0, 1 - dy / 400));
      }
    };
    const end = () => {
      if (!drag) return;
      drag = false;
      dveil.style.opacity = "";
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 120 || v > 0.6) hideSheet();
      else {
        dsheet.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.9,.25,1)" });
        dsheet.style.transform = "none";
      }
    };
    dsheet.addEventListener("touchstart", start, { passive: true });
    dsheet.addEventListener("touchmove", move, { passive: false });
    dsheet.addEventListener("touchend", end);
    dsheet.addEventListener("touchcancel", end);
  }
  /* rotating keeps the open spot open in the form that fits: phone → wide
     hands the sheet over to the inline panel, and (approved change, as the
     brief's §7 asks) wide → phone hands the panel over to the sheet */
  addEventListener("resize", () => {
    if (sheetOn && !phoneSheet()) {
      const el = open;
      hideSheet();
      if (el) swapTo(el);
    } else if (!sheetOn && open && phoneSheet()) {
      const el = open;
      bridge.close();
      open = null;
      showSheet(el, true);
    }
  });

  /* ---------- the minute tick: ageing, time left, expiry ---------- */
  function afterChange(changed: boolean) {
    if (changed) {
      const keep = open ? noOf(open) : null;
      renderRack();
      if (keep) openSpot(spotEl(keep), { align: false });
    } else bridge.tickMinute();
    renderCard();
  }
  setInterval(() => {
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
  async function shareSpot(s: FilledSpot) {
    const data: ShareData = {
      title: `${s.name} on fivehundrd.`,
      text: `${s.name} is on spot ${pad(numOf(s))} of 500. Gone in ${short(left(s))}.`,
      url: spotURL(s),
    };
    ev(s.id, "share");
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    bridge.openShare({ kind: "share", data });
    $("#shareVeil").classList.add("on");
  }
  function openKeep() {
    /* approved change: on phones the card is a sheet above the veil, so the
       login sheet opened behind it; close the card first, as Create does */
    if (cardOpen) setCard(false);
    bridge.openShare({ kind: "keep" });
    $("#shareVeil").classList.add("on");
  }
  function closeVeils() {
    stopAudio();
    document.querySelectorAll(".veil").forEach((v) => v.classList.remove("on"));
    document.body.style.overflow = "";
  }
  document.querySelectorAll(".veil").forEach((v) =>
    v.addEventListener("click", (e) => {
      if (e.target === v || (e.target as Element).closest("[data-close]")) closeVeils();
    }),
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
  function openClaim(no?: number) {
    const at = live && no ? WALL[no - 1] : null;
    const L: LaneId = at && at.lane ? at.lane : lane === "all" ? "music" : (lane as LaneId);
    const n = live ? (at && at.vacant && at.num) || randomVacant(L) : no || randomVacant();
    if (!n) {
      toast(live ? `Every ${LANE[L]} spot is taken. Check back soon.` : "All 500 spots are taken. Check back soon.");
      return;
    }
    bridge.openClaim({
      no: n,
      lane: L,
      seed: Math.floor(Math.random() * 1e9),
      pal: PAL[Math.floor(Math.random() * PAL.length)],
    });
    $("#claimVeil").classList.add("on");
    document.body.style.overflow = "hidden";
  }
  function placeClaim(draft: Draft): string | null | Promise<string | null> {
    /* the live wall holds the spot and sends the maker to Stripe Checkout */
    if (live) return liveApi.checkout(draft);
    if (!WALL[draft.no - 1].vacant) {
      const n = randomVacant();
      if (!n) return "Someone just took the last spot.";
      draft.no = n;
    }
    setTimeout(() => {
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
      try {
        const mine = (JSON.parse(localStorage.getItem("fh-claims") || "[]") as FilledSpot[]).filter((m) => m.no !== s.no);
        mine.push(s);
        localStorage.setItem("fh-claims", JSON.stringify(mine));
      } catch {}
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
  Object.assign(bridge.actions, {
    keepCard(via: string, remind: boolean, byEmail: boolean) {
      ACCOUNT = { via, remind };
      try {
        localStorage.setItem("fh-account", JSON.stringify(ACCOUNT));
      } catch {}
      closeVeils();
      renderCard();
      toast(byEmail ? "Check your inbox for the link. Your card is kept." : "Card kept.");
    },
    randomVacant,
    numberFor,
    placeClaim,
    previewClick: (e: MouseEvent, p: FilledSpot) => coverClick(e, p),
    share: (s: FilledSpot) => shareSpot(s),
    spotURL,
    seeOnWall(no: number) {
      closeVeils();
      openSpot(spotEl(no), { align: true });
    },
  } satisfies Bridge["actions"]);

  /* ---------- boot ---------- */
  const setHead = () => document.documentElement.style.setProperty("--headY", $("#top").getBoundingClientRect().bottom + 12 + "px");
  renderLanes();
  renderRack();
  setHead();
  addEventListener("resize", setHead);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(setHead);
  if (live) {
    bootLive();
    return;
  }
  const h = location.hash.replace("#", "");
  const start = (h && document.getElementById("s-" + h.padStart(3, "0"))) || rack.querySelector<HTMLElement>(".spot:not(.vacant):not(.filler)")!;
  requestAnimationFrame(() => {
    openSpot(start.classList.contains("vacant") ? rack.querySelector<HTMLElement>(".spot:not(.vacant):not(.filler)") : start, {
      align: !!h,
      auto: !h,
    });
  });

  /* ---------- the live wall: shared links, and coming back from Checkout ---------- */
  function bootLive() {
    const q = new URLSearchParams(location.search);
    const claimed = q.get("claimed"),
      cancelled = q.get("cancelled");
    const m = location.pathname.match(/^\/s\/([a-z]+)\/(\d+)\/?$/);
    const shared = m ? WALL.find((s): s is FilledSpot => !s.vacant && s.lane === m[1] && numOf(s) === +m[2]) : undefined;
    if (m && !shared) {
      toast("That story has left the wall. Here's who's on it now.");
      history.replaceState(null, "", "/");
    }
    if (claimed || cancelled) history.replaceState(null, "", "/");
    const first = rack.querySelector<HTMLElement>(".spot:not(.vacant):not(.filler)");
    const start = shared ? spotEl(shared.no) : first;
    requestAnimationFrame(() => {
      if (start) openSpot(start, { align: !!shared, auto: !shared });
      if (shared) ev(shared.id, "entry");
    });
    if (claimed) afterCheckout(claimed);
    if (cancelled)
      liveApi.cancelCheckout(cancelled).then(() => {
        toast("Checkout cancelled. Nothing was charged.");
        refreshFeed();
      });
  }
  /** Back from Stripe: wait for the payment to land, then show the maker their spot. */
  async function afterCheckout(id: string) {
    liveApi.addMine(id);
    for (let i = 0; i < 20; i++) {
      const st = await liveApi.checkoutStatus(id).catch(() => null);
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
          $("#claimVeil").classList.add("on");
          document.body.style.overflow = "hidden";
        }
        return;
      }
      if (!st || st.status === "vacant" || st.status === "released") break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    toast("We're confirming your payment. Your spot appears in a minute.");
  }
}
