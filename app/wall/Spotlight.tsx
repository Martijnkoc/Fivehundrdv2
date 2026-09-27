"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { hotspots, newest } from "../../lib/wall/hot";
import { placeholderStats, type WallStats } from "../../lib/wall/stats";
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
        {since && (
          <p className="sl-since">
            {since.fresh > 0 && <b>{`${since.fresh} new`}</b>}
            {since.fresh > 0 && since.gone > 0 && " · "}
            {since.gone > 0 && `${since.gone} gone`}
            {" since your last visit"}
          </p>
        )}
        <p className="sl-note">{view === "hot" ? "Traction right now. Changes every few hours." : "Just joined the wall."}</p>
      </div>
      <Reach stats={st.stats} />
      <ol className="sl-row">
        {shown.map(({ s, why }) => (
          <li key={s.id ?? s.no}>
            <button type="button" className="sl-item" onClick={() => bridge.actions.openHot(s.no)} aria-label={`${s.name}, No. ${pad(numOf(s))}${why ? `: ${why}` : ""}`}>
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

const n = (v: number) => v.toLocaleString("en-US");

/**
 * The wall's reach: people on the wall and spots saved, today or this week,
 * and what that means for a maker who isn't on it. Placeholder numbers until
 * the live feed carries them (lib/wall/stats.ts).
 */
function Reach({ stats }: { stats: WallStats | null }) {
  const [span, setSpan] = useState<"today" | "week">("today");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (stats) return;
    const t = setInterval(() => setNow(Date.now()), 20e3);
    return () => clearInterval(t);
  }, [stats]);
  const r = (stats ?? placeholderStats(now))[span];
  const when = span === "today" ? "today" : "this week";
  return (
    <div className="sl-stats">
      <div className="sl-sh">
        <span className="sl-live">
          <i aria-hidden="true" />
          Live
        </span>
        <div className="sl-tabs sm" role="tablist" aria-label="Period">
          <button type="button" role="tab" aria-selected={span === "today"} className={span === "today" ? "on" : undefined} onClick={() => setSpan("today")}>
            Today
          </button>
          <button type="button" role="tab" aria-selected={span === "week"} className={span === "week" ? "on" : undefined} onClick={() => setSpan("week")}>
            This week
          </button>
        </div>
      </div>
      <dl className="sl-nums">
        <div>
          <dt>{`Visitors ${when}`}</dt>
          <dd>{n(r.visitors)}</dd>
        </div>
        <div>
          <dt>{`Spots saved ${when}`}</dt>
          <dd>{n(r.saves)}</dd>
        </div>
      </dl>
      <p className="sl-fomo">
        <b>{`${n(r.visitors)} people walked the wall ${when}.`}</b>
        {" Not one of them saw your work. "}
        <button type="button" className="sl-claim" data-claim="">
          Put it on the wall
        </button>
      </p>
    </div>
  );
}
