import { flushSync } from "react-dom";
import type { NavId } from "../../lib/wall/model";
import type { Rack } from "../../lib/wall/rack";

/*
 * The state React renders while the rest of the prototype script
 * (./legacy.js) is still being ported. The script owns the wall's state and
 * hands React what to show; React renders it synchronously, because the
 * script reads the new DOM straight away (as it did after innerHTML).
 */
export type WallState = { lane: NavId; laneVersion: number; rack: Rack | null; version: number };

const initial: WallState = { lane: "all", laneVersion: 0, rack: null, version: 0 };
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
  /** Replaces the lane tabs, like the reference's innerHTML did (focus leaves the tab). */
  setLane(lane: NavId) {
    set({ lane, laneVersion: state.laneVersion + 1 });
  },
  /** Replaces the whole rack, like the reference's innerHTML did. */
  renderRack(rack: Rack) {
    document.querySelector("#rack .panel")?.remove();
    set({ rack, version: state.version + 1 });
  },
};

export type Bridge = typeof bridge;
