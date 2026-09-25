import { flushSync } from "react-dom";
import type { NavId, Spot } from "../../lib/wall/model";
import type { Rack } from "../../lib/wall/rack";

/*
 * The state React renders while the rest of the prototype script
 * (./legacy.js) is still being ported. The script decides what happens; React
 * renders it synchronously, because the script measures and animates the new
 * DOM straight away (as it did after innerHTML).
 */
export type WallState = {
  lane: NavId;
  laneVersion: number;
  rack: Rack | null;
  version: number;
  /** The wall's spots. The script mutates their counters, then calls refresh(). */
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
  /** Bumped when the script changed spot counters. */
  rev: number;
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
};
let state = initial;
const listeners = new Set<() => void>();

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
  tickMinute() {
    set({ minute: state.minute + 1 });
  },
};

export type Bridge = typeof bridge;
