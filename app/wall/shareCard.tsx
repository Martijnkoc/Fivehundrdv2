"use client";

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LANE, numOf, pad, type FilledSpot } from "../../lib/wall/model";
import { SpotTile } from "./Tile";

/*
 * Share cards (§15): the spot as people post it. The card is built around the
 * wall's own tile (SpotTile), from the same data and styles, on a social
 * canvas with the Fivehundrd wordmark and the spot's lasting link, then
 * turned into a PNG in the browser. Nothing here redraws the spot by hand.
 */

export type ShareFormat = "story" | "square" | "wide";
/** Laid out at a third of the final size and printed at 3×. */
export const FORMATS: Record<ShareFormat, { w: number; h: number; tile: number; label: string; hint: string }> = {
  story: { w: 360, h: 640, tile: 244, label: "Story", hint: "Instagram, TikTok" },
  square: { w: 360, h: 360, tile: 158, label: "Square", hint: "Feeds, WhatsApp" },
  wide: { w: 400, h: 210, tile: 98, label: "Wide", hint: "X, LinkedIn" },
};
const SCALE = 3;

/** The link as printed on the card: no protocol, no trailing slash. */
const printed = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

function Wordmark() {
  return (
    <span className="sc-brand">
      <span>
        Fivehundrd<span className="bdot">.</span>
      </span>
      <small>Discover before the crowd.</small>
    </span>
  );
}

/** One share card. `url` is the spot's lasting link. */
export function ShareCard({ s, url, format }: { s: FilledSpot; url: string; format: ShareFormat }) {
  const f = FORMATS[format];
  const id = `No. ${pad(numOf(s))} of 500 · ${LANE[s.lane]}`;
  if (format === "wide")
    return (
      <div className="sc sc-wide" style={{ width: f.w, height: f.h }}>
        <div className="sc-tile">
          <SpotTile s={s} width={f.tile} />
        </div>
        <div className="sc-side">
          <Wordmark />
          <span className="sc-id">{id}</span>
          <b className="sc-name">{s.name}</b>
          {s.snippet && <p className="sc-snip">{s.snippet}</p>}
          <span className="sc-url">{printed(url)}</span>
        </div>
      </div>
    );
  return (
    <div className={`sc sc-${format}`} style={{ width: f.w, height: f.h }}>
      <div className="sc-top">
        <Wordmark />
        <span className="sc-id">{id}</span>
      </div>
      <div className="sc-main">
        <div className="sc-tile">
          <SpotTile s={s} width={f.tile} />
        </div>
        {format === "story" && s.snippet && <p className="sc-snip">{s.snippet}</p>}
      </div>
      <div className="sc-foot">
        <span className="sc-url">{printed(url)}</span>
        {format === "story" && <span className="sc-cta">Find it on the wall</span>}
      </div>
    </div>
  );
}

const cache = new Map<string, Promise<Blob>>();
const keyOf = (s: FilledSpot, url: string, format: ShareFormat) => `${s.id ?? s.no}:${s.name}:${s.img ?? ""}:${url}:${format}`;

/** The card as a PNG (cached per spot, link and format). */
export function shareCardBlob(s: FilledSpot, url: string, format: ShareFormat): Promise<Blob> {
  const k = keyOf(s, url, format);
  let p = cache.get(k);
  if (!p) {
    p = render(s, url, format);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

/** A ready card, if one was already printed (so Share can hand it over straight away). */
const ready = new Map<string, Blob>();
export function readyCard(s: FilledSpot, url: string, format: ShareFormat) {
  return ready.get(keyOf(s, url, format)) ?? null;
}

async function render(s: FilledSpot, url: string, format: ShareFormat): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const f = FORMATS[format];
  /* laid out off screen, in the page, so it gets the wall's own styles and fonts */
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<ShareCard s={s} url={url} format={format} />));
    const node = host.firstElementChild as HTMLElement;
    await document.fonts.ready;
    await Promise.all([...node.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
    const blob = await toBlob(node, {
      width: f.w,
      height: f.h,
      pixelRatio: SCALE,
      cacheBust: false,
      /* the card has its own page colour; the veil and body grain aren't part of it */
      backgroundColor: getComputedStyle(node).backgroundColor,
    });
    if (!blob) throw new Error("card");
    ready.set(keyOf(s, url, format), blob);
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
}

/** A file name people recognise in their camera roll. */
export const cardFileName = (s: FilledSpot, format: ShareFormat) =>
  `fivehundrd-${s.lane}-${pad(numOf(s))}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)}-${format}.png`;
