"use client";

import { useEffect, useState } from "react";
import { toSpot } from "../../../../../../lib/wall/live";
import { LANE, numOf, pad } from "../../../../../../lib/wall/model";
import { styleFor } from "../../../../../../lib/wall/time";
import type { PublicStory } from "../../../../../../lib/server/story";
import { startPlay, togglePlay } from "../../../../../wall/audio";
import { Cover } from "../../../../../wall/Cover";
import { cardFileName, shareCardBlob } from "../../../../../wall/shareCard";
import { cssVars } from "../../../../../wall/Tile";
import { startTracking } from "../../../../../wall/track";

/**
 * A story after its 72 hours: the same open view as on the wall (Cover),
 * aged the way the wall ages spots, with its maker's links, a way to share
 * it on, and the way back to the wall. Links shared once keep working.
 */
export function Discovery({ story, base }: { story: PublicStory; base: string }) {
  const [s] = useState(() => toSpot(story, 1, base, new Set()));
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(location.origin + location.pathname);
    startTracking();
  }, []);

  const share = async () => {
    const text = `${s.name} on fivehundrd.`;
    try {
      const blob = await shareCardBlob(s, url, "story");
      const file = new File([blob], cardFileName(s, "story"), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: `${text} ${url}` });
      if (navigator.share) return await navigator.share({ title: text, url });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
  };
  const [copied, setCopied] = useState(false);

  /* the preview player works here too */
  const onClick = (e: React.MouseEvent) => {
    const t = e.target as Element;
    const none = () => {};
    const pl = t.closest("[data-play]");
    if (pl) return togglePlay(pl.closest<HTMLElement>("[data-player]")!, s, none);
    const wv = t.closest("[data-wave]");
    if (wv) {
      const r = wv.getBoundingClientRect();
      startPlay(wv.closest<HTMLElement>("[data-player]")!, s, Math.max(0, Math.min(0.98, (e.clientX - r.left) / r.width)) * 30, none);
    }
  };

  return (
    <div className="disc">
      <header className="disc-top">
        <a className="brand" href="/">
          Fivehundrd<span className="bdot">.</span>
        </a>
        <a className="btn-create" href="/">
          See the wall
        </a>
      </header>
      <main className="disc-main">
        <p className="disc-note">
          {`${LANE[s.lane]}, No. ${pad(numOf(s))}. `}
          <b>{`${s.name} had their 72 hours on the wall.`}</b>
          {" The wall moves on; the work doesn't. Here's where to find them."}
        </p>
        <div className="panel disc-spot" style={cssVars(styleFor(s))} onClick={onClick}>
          <Cover s={s} saved={false} preview />
        </div>
        <div className="disc-acts">
          <button className="act solid" onClick={share}>
            {copied ? "Link copied" : "Share"}
          </button>
          <a className="act" href="/">
            See who&apos;s on the wall now
          </a>
          <a className="act" href="/?create=1">
            Get your own spot
          </a>
        </div>
      </main>
    </div>
  );
}
