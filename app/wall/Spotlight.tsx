"use client";

import { useState, useSyncExternalStore } from "react";
import { HOTSPOTS } from "../../lib/site/copy";
import { hotspots, newest } from "../../lib/wall/hot";
import { numOf, pad } from "../../lib/wall/model";
import { bridge, wallStore } from "./store";
import { SpotTile } from "./Tile";

/**
 * Above the wall (approved change): the spots with traction right now, or
 * the newest, and what changed since your last visit. Taps open the spot on
 * the wall itself. It follows the lane you're on. Seven on desktop, a row
 * across the whole page; five below that (the CSS hides the last two).
 */
const RAIL = 7;
export function Spotlight() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const [tab, setTab] = useState<"hot" | "new">("hot");
  /* phones: the rail's room is kept until the wall is in, so it doesn't push the wall down when it arrives */
  if (!st.rack) return <section className="spotlight sl-wait" aria-hidden="true" />;
  if (st.rack.empty) return null;
  const picks = tab === "hot" ? hotspots(st.wall, st.hot, st.lane, RAIL) : newest(st.wall, st.lane, RAIL);
  const hotCount = tab === "hot" ? picks.length : hotspots(st.wall, st.hot, st.lane, RAIL).length;
  /* nothing has traction yet: show the newest instead of an empty row */
  const view = tab === "hot" && !hotCount ? "new" : tab;
  const shown = view === tab ? picks : newest(st.wall, st.lane, RAIL);
  if (!shown.length) return null;
  const since = st.since && (st.since.fresh || st.since.gone) ? st.since : null;
  const item = st.sinceItem;
  return (
    <section className="spotlight" aria-label={view === "hot" ? "Hotspots" : "Newest spots"}>
      <div className="sl-in">
      <div className="sl-head">
        <div className="sl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === "hot"} className={view === "hot" ? "on" : undefined} onClick={() => setTab("hot")} disabled={!hotCount}>
            Hotspots
          </button>
          <button type="button" role="tab" aria-selected={view === "new"} className={view === "new" ? "on" : undefined} onClick={() => setTab("new")}>
            Newest
          </button>
        </div>
        {(since || item) && (
          <p className="sl-since">
            {since && since.fresh > 0 && <b>{`${since.fresh} new`}</b>}
            {since && since.fresh > 0 && since.gone > 0 && !item && " · "}
            {since && since.gone > 0 && (!item || !since.fresh) && `${since.gone} gone`}
            {since && " since your last visit"}
            {/* one thing that changed for you (lib/wall/retention.ts) */}
            {item && (
              <>
                {since && " · "}
                <button type="button" className="sl-mine" onClick={() => (item.no ? bridge.actions.openHot(item.no, "since") : bridge.actions.openFinds())}>
                  {item.text}
                </button>
              </>
            )}
          </p>
        )}
        <p className="sl-note">{view === "hot" ? HOTSPOTS.sub : HOTSPOTS.newest}</p>
      </div>
      <ol className="sl-row">
        {shown.map(({ s, why }) => (
          <li key={s.id ?? s.no}>
            <button type="button" className="sl-item" onClick={() => bridge.actions.openHot(s.no, view)} aria-label={`${s.name}, No. ${pad(numOf(s))}${why ? `: ${why}` : ""}`}>
              <SpotTile s={s} />
              {why && <span className="sl-why">{why}</span>}
            </button>
          </li>
        ))}
      </ol>
      </div>
    </section>
  );
}

