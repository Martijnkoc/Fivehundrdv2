"use client";

import { Fragment, useSyncExternalStore, type CSSProperties } from "react";
import { pad } from "../../lib/wall/model";
import type { RackItem } from "../../lib/wall/rack";
import { wallStore } from "./store";
import { Filler, Tile } from "./Tile";

function clearSearch() {
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "";
  q.dispatchEvent(new Event("input"));
}

function Item({ item }: { item: RackItem }) {
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
          <Tile key={s.no} s={s} />
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
  const { rack, version } = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  return (
    <ol className="rack" id="rack">
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
          {rack.items.map((item, i) => (
            <Item key={i} item={item} />
          ))}
        </Fragment>
      )}
    </ol>
  );
}
