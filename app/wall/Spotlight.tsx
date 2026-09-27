"use client";

import { useState, useSyncExternalStore } from "react";
import { hotspots, newest } from "../../lib/wall/hot";
import { numOf, pad } from "../../lib/wall/model";
import { bridge, wallStore } from "./store";
import { SpotTile } from "./Tile";

/**
 * Above the wall (approved change): five spots with traction right now, or
 * the five newest, and what changed since your last visit. Taps open the spot
 * on the wall itself. It follows the lane you're on.
 */
export function Spotlight() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const [tab, setTab] = useState<"hot" | "new">("hot");
  if (!st.rack || st.rack.empty) return null;
  const picks = tab === "hot" ? hotspots(st.wall, st.hot, st.lane) : newest(st.wall, st.lane);
  const hotCount = tab === "hot" ? picks.length : hotspots(st.wall, st.hot, st.lane).length;
  /* nothing has traction yet: show the newest instead of an empty row */
  const view = tab === "hot" && !hotCount ? "new" : tab;
  const shown = view === tab ? picks : newest(st.wall, st.lane);
  if (!shown.length) return null;
  const since = st.since && (st.since.fresh || st.since.gone) ? st.since : null;
  return (
    <section className="spotlight" aria-label={view === "hot" ? "Hotspots" : "Newest spots"}>
      <div className="sl-head">
        <div className="sl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === "hot"} className={view === "hot" ? "on" : undefined} onClick={() => setTab("hot")} disabled={!hotCount}>
            Hotspots
          </button>
          <button type="button" role="tab" aria-selected={view === "new"} className={view === "new" ? "on" : undefined} onClick={() => setTab("new")}>
            Newest
          </button>
        </div>
        {since && (
          <p className="sl-since">
            {since.fresh > 0 && <b>{`${since.fresh} new`}</b>}
            {since.fresh > 0 && since.gone > 0 && " · "}
            {since.gone > 0 && `${since.gone} gone`}
            {" since your last visit"}
          </p>
        )}
      </div>
      <ol className="sl-row">
        {shown.map(({ s, why }) => (
          <li key={s.id ?? s.no}>
            <button type="button" className="sl-item" onClick={() => bridge.actions.openHot(s.no)} aria-label={`${s.name}, No. ${pad(numOf(s))}${why ? `: ${why}` : ""}`}>
              <SpotTile s={s} width={104} />
              {why && <span className="sl-why">{why}</span>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
