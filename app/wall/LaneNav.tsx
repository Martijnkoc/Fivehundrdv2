"use client";

import { useSyncExternalStore } from "react";
import { NAV } from "../../lib/wall/model";
import { wallStore } from "./store";

/** The header's lane tabs (§9). Clicks are handled by the wall script. */
export function LaneNav() {
  const { lane } = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  return (
    <nav className="primary" id="lanes" aria-label="Lanes">
      {NAV.map(([k, v]) => (
        <a key={k} href="#" data-lane={k} className={k === lane ? "is-active" : undefined} aria-current={k === lane ? "page" : undefined}>
          {v}
        </a>
      ))}
    </nav>
  );
}
