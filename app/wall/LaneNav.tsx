"use client";

import { Fragment, useSyncExternalStore } from "react";
import { NAV } from "../../lib/wall/model";
import { lanePath } from "../../lib/site/facts";
import { wallStore } from "./store";

/** The header's lane tabs (§9). Clicks are handled by the wall script. */
export function LaneNav() {
  const { lane, laneVersion } = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  return (
    <nav className="primary" id="lanes" aria-label="Lanes">
      {/* Rebuilt on every lane change, as in the reference (focus leaves the tab). */}
      <Fragment key={laneVersion}>
        {NAV.map(([k, v]) => (
          <a key={k} href={lanePath(k)} data-lane={k} className={k === lane ? "is-active" : undefined} aria-current={k === lane ? "page" : undefined}>
            {v}
          </a>
        ))}
      </Fragment>
    </nav>
  );
}
