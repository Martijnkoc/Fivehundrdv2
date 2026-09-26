"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { phrase } from "../../../../lib/founder/feedText";
import type { FeedItem, Live } from "../../../../lib/founder/types";
import { Icons, type IconName } from "./icons";

const ICON: Record<string, IconName> = {
  visit: "visit",
  open: "open",
  save: "save",
  unsave: "save",
  share: "shares",
  link_click: "link",
  entry: "link",
  create_start: "create",
  create_step: "create",
  checkout: "card",
  paid: "card",
};
const key = (i: FeedItem) => `${i.at}|${i.kind}|${i.story ?? ""}|${i.step ?? ""}|${i.source ?? ""}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Fivehundrd as it happens: new moments every few seconds, newest on top.
 * Polls the server (the feed is small); pauses while the tab is hidden.
 */
export function LiveFeed({ initial, live: live0, limit = 30, kinds, every = 5000 }: { initial: FeedItem[]; live: Live; limit?: number; kinds?: string[]; every?: number }) {
  const [items, setItems] = useState(initial);
  const [live, setLive] = useState(live0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const since = useRef(initial[0]?.at ?? new Date(Date.now() - 3600e3).toISOString());

  useEffect(() => {
    let t = 0;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const r = await fetch(`/api/founder/feed?since=${encodeURIComponent(since.current)}`, { cache: "no-store" });
          if (r.ok) {
            const d = (await r.json()) as { items: FeedItem[]; live: Live };
            setLive(d.live);
            const add = d.items.filter((i) => !kinds || kinds.includes(i.kind));
            if (d.items[0]) since.current = d.items[0].at;
            if (add.length) {
              setFresh(new Set(add.map(key)));
              setItems((cur) => {
                const seen = new Set(cur.map(key));
                return [...add.filter((i) => !seen.has(key(i))), ...cur].slice(0, limit);
              });
            }
          }
        } catch {}
      }
      t = window.setTimeout(tick, every);
    };
    t = window.setTimeout(tick, every);
    return () => clearTimeout(t);
  }, [every, kinds, limit]);

  return (
    <div className="livebox">
      <div className="live-now">
        <b>{live.now.toLocaleString("en-US")}</b>
        <span className="ink2" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <i className="live-dot" aria-hidden="true" /> {live.now === 1 ? "person" : "people"} active in the last 5 minutes
        </span>
      </div>
      {items.length ? (
        <ol className="feed" aria-live="polite" aria-label="Live activity">
          {items.slice(0, limit).map((i) => {
            const p = phrase(i);
            return (
              <li key={key(i)} className={fresh.has(key(i)) ? "fresh" : undefined}>
                <time dateTime={i.at}>{time(i.at)}</time>
                <span className={`ic${i.kind === "paid" ? " paid" : ""}`}>{Icons[ICON[i.kind] ?? "events"]}</span>
                <span className="txt">
                  {p.lead}{" "}
                  {p.spot &&
                    (i.story ? (
                      <Link href={`/founder/spots/${i.story}`}>
                        <b>{p.spot}</b>
                      </Link>
                    ) : (
                      <b>{p.spot}</b>
                    ))}
                  {p.tail && ` ${p.tail}`}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="empty" style={{ marginTop: 12 }}>
          <b>Quiet right now.</b>
          <p>Visits, opens, saves, shares and payments appear here the moment they happen.</p>
        </div>
      )}
    </div>
  );
}
