import { flushSync } from "react-dom";
import type { FilledSpot, LaneId, NavId, Spot } from "../../lib/wall/model";
import type { HotEntry } from "../../lib/wall/hot";
import type { SinceItem } from "../../lib/wall/retention";
import type { Rack } from "../../lib/wall/rack";
import type { CardData } from "./Card";
import type { ClaimStart, ClaimView, Draft } from "./Claim";
import type { ShareView } from "./Sheets";

/*
 * The state React renders. The controller (./controller.ts) decides what
 * happens; React renders it synchronously, because the controller measures
 * and animates the new DOM straight away (as the reference did after
 * innerHTML).
 */
export type WallState = {
  lane: NavId;
  laneVersion: number;
  rack: Rack | null;
  version: number;
  /** The wall's spots. The controller mutates their counters, then calls refresh(). */
  wall: Spot[];
  /** The open spot and how it is shown (§6 inline panel, §7 phone sheet). */
  openNo: number | null;
  view: "panel" | "sheet" | null;
  /** What the phone sheet shows; outlives openNo while the sheet slides away. */
  sheetNo: number | null;
  /** Saved stories, by story key (§11). */
  saved: ReadonlySet<string>;
  /** Bumped every minute, so time left and ageing re-render. */
  minute: number;
  /** Bumped when the controller changed spot counters. */
  rev: number;
  /** The Fivehundrd card (§10); rebuilt on every change, like innerHTML. */
  card: CardData | null;
  cardVersion: number;
  /** What #shareSheet shows (§15 share fallback, §12 Keep my card). */
  share: ShareView | null;
  shareVersion: number;
  toast: { msg: string; on: boolean };
  /** What #claimSheet shows (§13 form, then the success screen). */
  claim: ClaimView | null;
  claimVersion: number;
  /** Phones: tile patterns as images. */
  compact: boolean;
  /** The live wall: accounts are real (not the demo's prototype sheet). */
  live: boolean;
  /** Reminders are actually sent (the demo wall shows the reference's promise; the live wall only once email is set up). */
  reminders: boolean;
  /** Above the wall: what has traction right now (live wall; null on the demo wall), and what changed since the last visit. */
  hot: HotEntry[] | null;
  since: { at: number; fresh: number; gone: number } | null;
  /** The one thing that changed for this visitor (lib/wall/retention.ts). */
  sinceItem: SinceItem | null;
  /** Scout: after a signed-out Timeheart, the sign-in line shows under that story's actions (its key). */
  scoutNudge: string | null;
};

const initial: WallState = {
  lane: "all",
  laneVersion: 0,
  rack: null,
  version: 0,
  wall: [],
  openNo: null,
  view: null,
  sheetNo: null,
  saved: new Set(),
  minute: 0,
  rev: 0,
  card: null,
  cardVersion: 0,
  share: null,
  shareVersion: 0,
  toast: { msg: "", on: false },
  claim: null,
  claimVersion: 0,
  compact: false,
  live: false,
  reminders: true,
  hot: null,
  since: null,
  sinceItem: null,
  scoutNudge: null,
};
let state = initial;
const listeners = new Set<() => void>();
/*
 * How many rack items are rendered: the wall is built a few rows at a time
 * (the rest when the browser is idle). Its own store, so each step renders
 * only the rack, not everything else that reads the wall (speed pass).
 */
let limit = Infinity;
const limitListeners = new Set<() => void>();
export const limitStore = {
  get: () => limit,
  getServer: () => Infinity,
  subscribe(listener: () => void) {
    limitListeners.add(listener);
    return () => limitListeners.delete(listener);
  },
};
function setLimitNow(n: number) {
  if (n === limit) return;
  flushSync(() => {
    limit = n;
    limitListeners.forEach((l) => l());
  });
}
let toastTimer: ReturnType<typeof setTimeout>;

export const wallStore = {
  get: () => state,
  getServer: () => initial,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/* inside batch(): changes are kept and rendered once, at the end */
let batching = 0,
  dirty = false;
function set(patch: Partial<WallState>) {
  if (batching) {
    state = { ...state, ...patch };
    dirty = true;
    return;
  }
  flushSync(() => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  });
}

export const bridge = {
  /**
   * Runs `f` with every change it makes rendered once, when it returns (the
   * wall's start: about ten changes, each a render of everything, were most of
   * a slow phone's first second). Inside, the DOM doesn't show the changes yet.
   */
  batch<T>(f: () => T): T {
    batching++;
    try {
      return f();
    } finally {
      if (!--batching && dirty) {
        dirty = false;
        flushSync(() => {
          listeners.forEach((l) => l());
          limitListeners.forEach((l) => l());
        });
      }
    }
  },
  /** A fresh start: nothing of a previous run of the wall (left by a link, then back) is left over. */
  reset() {
    clearTimeout(toastTimer);
    setLimitNow(Infinity);
    set(initial);
  },
  setWall(wall: Spot[]) {
    set({ wall });
  },
  /** Replaces the lane tabs, like the reference's innerHTML did (focus leaves the tab). */
  setLane(lane: NavId) {
    set({ lane, laneVersion: state.laneVersion + 1 });
  },
  /** Replaces the whole rack, like the reference's innerHTML did; nothing is open after. */
  renderRack(rack: Rack, n = Infinity) {
    /* one render: the new rack with its first rows (the rack reads the limit as it renders) */
    limit = n;
    set({ rack, version: state.version + 1, openNo: null, view: null });
  },
  /** Renders more of the rack (built a few rows at a time). */
  setLimit(n: number) {
    setLimitNow(n);
  },
  setMode(live: boolean, reminders: boolean) {
    set({ live, reminders });
  },
  setCompact(compact: boolean) {
    if (compact !== state.compact) set({ compact });
  },
  /** Opens a spot inline under its row, or marks it open behind the phone sheet. */
  open(no: number, view: "panel" | "sheet") {
    set({ openNo: no, view });
  },
  close() {
    set({ openNo: null, view: null });
  },
  /** What the phone sheet shows (null once it has slid away). */
  fillSheet(no: number | null) {
    set({ sheetNo: no });
  },
  setHot(hot: HotEntry[] | null) {
    set({ hot });
  },
  setSinceItem(sinceItem: SinceItem | null) {
    set({ sinceItem });
  },
  setScoutNudge(scoutNudge: string | null) {
    set({ scoutNudge });
  },
  setSince(since: WallState["since"]) {
    set({ since });
  },
  setSaved(keys: string[]) {
    set({ saved: new Set(keys), rev: state.rev + 1 });
  },
  refresh() {
    set({ rev: state.rev + 1 });
  },
  setCard(card: CardData) {
    set({ card, cardVersion: state.cardVersion + 1 });
  },
  tickMinute() {
    set({ minute: state.minute + 1 });
  },
  /** Fills #shareSheet; the controller shows its veil. */
  openShare(share: ShareView) {
    set({ share, shareVersion: state.shareVersion + 1 });
  },
  toast(msg: string) {
    clearTimeout(toastTimer);
    set({ toast: { msg, on: true } });
    toastTimer = setTimeout(() => set({ toast: { msg, on: false } }), 2400);
  },
  /** Fills #claimSheet with a fresh Create form; the controller shows its veil. */
  openClaim(start: ClaimStart) {
    set({ claim: { kind: "form", start }, claimVersion: state.claimVersion + 1 });
  },
  claimDone(spot: FilledSpot) {
    set({ claim: { kind: "done", spot }, claimVersion: state.claimVersion + 1 });
  },
  /** Things React asks the controller to do, registered by the controller. */
  actions: {} as {
    keepCard: (via: string, remind: boolean, byEmail: boolean) => void;
    randomVacant: (lane?: LaneId) => number | null;
    numberFor: (lane: LaneId, no: number) => number;
    /** Starts placing the spot; returns an error message, or null (on the live wall, once Checkout fails or opens). */
    placeClaim: (draft: Draft) => string | null | Promise<string | null>;
    /** Saves a live spot's fixed words and links (its first hour); an error message, or null once saved. */
    saveEdit: (id: string, draft: Draft) => Promise<string | null>;
    previewClick: (e: MouseEvent, spot: FilledSpot) => void;
    share: (spot: FilledSpot) => void;
    /** Opens the share sheet (every card size, save, copy) without trying the native sheet first. */
    shareSheet: (spot: FilledSpot) => void;
    seeOnWall: (no: number) => void;
    /** Opens a spot from Hotspots or Newest, on the whole wall if the current lane or search hides it. */
    openHot: (no: number, from?: "hot" | "new" | "since") => void;
    openFinds: () => void;
    /** Scout (docs/scout.md): a tier move was shown on the card. */
    scoutMoveSeen?: (id: number) => void;
    /** Shares (or stops sharing) the Scout Card under a chosen name; the card's link, or an error message. */
    scoutShare: (on: boolean, name?: string, fresh?: boolean) => Promise<{ url: string | null } | { error: string }>;
    /** The sign-in sheet, from a Timeheart: back to this story afterwards. */
    scoutSignIn: (story?: string) => void;
    scoutNudgeClosed: () => void;
    /** The first screen's calls to action (docs/copy.md). */
    heroCta: () => void;
    spotURL: (spot: FilledSpot) => string;
  },
};

export type Bridge = typeof bridge;
