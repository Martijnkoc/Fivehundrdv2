"use client";

import { Fragment, useSyncExternalStore, type CSSProperties } from "react";
import { pad, type FilledSpot } from "../../lib/wall/model";
import type { RackItem } from "../../lib/wall/rack";
import { skey } from "../../lib/wall/saves";
import { styleFor } from "../../lib/wall/time";
import { Cover } from "./Cover";
import { wallStore, type WallState } from "./store";
import { Filler, Tile, cssVars } from "./Tile";

function clearSearch() {
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "";
  q.dispatchEvent(new Event("input"));
}

/** §6 desktop: the open spot's full view, directly under its row. */
function Panel({ s, saved }: { s: FilledSpot; saved: boolean }) {
  return (
    <li className="panel" data-no={s.no} style={cssVars(styleFor(s))}>
      <Cover s={s} saved={saved} />
    </li>
  );
}

function Item({ item, st }: { item: RackItem; st: WallState }) {
  if (item.kind === "wrap")
    return (
      <li className="ring-wrap">
        <span>{`Round the circle, back to No. ${pad(item.no)}`}</span>
      </li>
    );
  if (item.kind === "end")
    return (
      <li className="ring-note end">
        {`That's the whole wall. You started at No. ${pad(item.entryNo)}, so the spots before it come round next time too.`}
      </li>
    );
  return (
    <li className="shelf-row">
      <div className="books" style={{ "--cols": String(item.spots.length + item.fillers) } as CSSProperties}>
        {item.spots.map((s) => (
          <Tile
            key={s.no}
            s={s}
            open={s.no === st.openNo}
            opens={s.vacant ? undefined : s.opens}
            saves={s.vacant ? undefined : s.saves}
            minute={st.minute}
            compact={st.compact}
          />
        ))}
        {Array.from({ length: item.fillers }, (_, i) => (
          <Filler key={`f${i}`} />
        ))}
      </div>
    </li>
  );
}

/** The wall (§5, §6): rows of tiles round the circle from this visitor's entry. */
export function Rack() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const { rack, version } = st;
  const open = st.view === "panel" && st.openNo ? (st.wall[st.openNo - 1] as FilledSpot) : null;
  const complete = !!rack && st.limit >= rack.items.length;
  return (
    <ol className="rack" id="rack" data-complete={complete ? "" : undefined}>
      {rack && (
        /* A new key per render: the wall is rebuilt, as it was with innerHTML. */
        <Fragment key={version}>
          {rack.empty && (
            <li className="no-hits">
              {"Nothing on the wall matches "}
              <b>{rack.query}</b>
              {" right now. Try a lane, or "}
              <button className="chip drop" type="button" onClick={clearSearch}>
                clear the search
              </button>
            </li>
          )}
          {rack.items.slice(0, st.limit).map((item, i) => (
            <Fragment key={i}>
              <Item item={item} st={st} />
              {open && item.kind === "row" && item.spots.some((s) => s.no === open.no) && (
                <Panel key={`panel-${open.no}`} s={open} saved={st.saved.has(skey(open))} />
              )}
            </Fragment>
          ))}
        </Fragment>
      )}
    </ol>
  );
}
