import { flushSync } from "react-dom";
import type { FilledSpot, LaneId, NavId, Spot } from "../../lib/wall/model";
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
};
let state = initial;
const listeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout>;

export const wallStore = {
  get: () => state,
  getServer: () => initial,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function set(patch: Partial<WallState>) {
  flushSync(() => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  });
}

export const bridge = {
  setWall(wall: Spot[]) {
    set({ wall });
  },
  /** Replaces the lane tabs, like the reference's innerHTML did (focus leaves the tab). */
  setLane(lane: NavId) {
    set({ lane, laneVersion: state.laneVersion + 1 });
  },
  /** Replaces the whole rack, like the reference's innerHTML did; nothing is open after. */
  renderRack(rack: Rack) {
    set({ rack, version: state.version + 1, openNo: null, view: null });
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
    /** Sends a report; returns an error message, or null once it was sent. */
    report: (id: string, reason: string, note: string, email: string) => Promise<string | null>;
    randomVacant: (lane?: LaneId) => number | null;
    numberFor: (lane: LaneId, no: number) => number;
    /** Starts placing the spot; returns an error message, or null (on the live wall, once Checkout fails or opens). */
    placeClaim: (draft: Draft) => string | null | Promise<string | null>;
    previewClick: (e: MouseEvent, spot: FilledSpot) => void;
    share: (spot: FilledSpot) => void;
    seeOnWall: (no: number) => void;
    spotURL: (spot: FilledSpot) => string;
  },
};

export type Bridge = typeof bridge;
