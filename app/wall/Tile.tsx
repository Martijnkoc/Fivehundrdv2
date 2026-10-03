import { createElement, memo, type CSSProperties } from "react";
import { BRAND, OPEN_SPOT } from "../../lib/site/copy";
import { artShapes, genArt } from "../../lib/wall/art";
import { EYE, HANDS, HEART, LANE_ICON_PATHS } from "../../lib/wall/icons";
import { COST, LANE, LIFE, fmt, numOf, pad, type FilledSpot, type LaneId, type Palette, type Spot } from "../../lib/wall/model";
import { LAST, clock, left, phase, short, spotStyle } from "../../lib/wall/time";

/** "--a:1;--b:2" → { "--a": "1", "--b": "2" } */
export function cssVars(style: string) {
  return Object.fromEntries(
    style
      .split(";")
      .filter(Boolean)
      .map((decl) => {
        const i = decl.indexOf(":");
        return [decl.slice(0, i), decl.slice(i + 1)];
      }),
  ) as CSSProperties;
}

export const GenArt = memo(function GenArt({ seed, pal }: { seed: number; pal: Palette }) {
  const { bg, shapes } = artShapes(seed, pal);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="300" fill={bg} />
      {shapes.map((s, i) => createElement(s.tag, { key: i, ...Object.fromEntries(s.attrs) }))}
    </svg>
  );
});

export function LaneIcon({ lane }: { lane: LaneId }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: LANE_ICON_PATHS[lane] }}
    />
  );
}

function PillIcon({ paths }: { paths: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" dangerouslySetInnerHTML={{ __html: paths }} />;
}

/* Phones: the printed pattern as one image instead of an inline SVG of many
   shapes, so the wall has far fewer elements and the pattern is decoded off
   the main thread. Same markup, so the same picture. */
const artURLs = new Map<string, string>();
function artURL(seed: number, pal: Palette) {
  const k = seed + pal.join();
  let u = artURLs.get(k);
  if (!u) artURLs.set(k, (u = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(genArt(seed, pal))));
  return u;
}

/** The front of a tile: the maker's artwork, their logo, or (demo) a pattern. */
function Front({ s, compact }: { s: FilledSpot; compact?: boolean }) {
  if (s.img) return <img src={s.img} alt="" loading="lazy" decoding="async" />;
  if (s.logo)
    return (
      <span className="bk-logo">
        <img src={s.logo} alt="" loading="lazy" decoding="async" />
      </span>
    );
  if (compact) return <img src={artURL(s.seed, s.pal)} alt="" decoding="async" />;
  return <GenArt seed={s.seed} pal={s.pal} />;
}

/* Whitespace text nodes mirror the reference's markup, so inline layout
   (and with it every pixel) is unchanged. */
const NL6 = "\n      ";
const NL4 = "\n    ";

function Filled({ s, open, still, compact, since, big }: { s: FilledSpot; open: boolean; still?: boolean; compact?: boolean; since?: number; big?: boolean }) {
  const l = left(s),
    recent = LIFE - l < 3 * 3600e3,
    /* approved change: also new to you, since your last visit */
    newToYou = !still && !!since && s.start > since,
    fresh = recent || newToYou;
  /* on the wall the tile is a button; as a preview or share card, the same tile as a picture */
  const Book = still ? "div" : "button";
  return (
    <>
      <div className="stand">
        <Book
          className="book"
          aria-expanded={still ? undefined : open}
          aria-label={still ? undefined : `${s.name}, ${LANE[s.lane]}, spot ${numOf(s)}`}
        >
          {NL6}
          <span className="bk-art">
            <Front s={s} compact={compact} />
          </span>
          {NL6}
          <span className="bk-strip">
            {/* craft pass: a big spot is a Hotspot, and reads like a feature: a kicker, the name, its line */}
            {big && <em className="bk-kick">Hotspot</em>}
            <b>{s.name}</b>
            {big && s.snippet && <i className="bk-snip">{s.snippet}</i>}
            <small>
              <LaneIcon lane={s.lane} />
              {LANE[s.lane]}
            </small>
          </span>
          {NL6}
          <span className="bk-no">{pad(numOf(s))}</span>
          {fresh && <i className="new" title={recent ? "Joined in the last 3 hours" : "New since your last visit"}></i>}
          <i className="prog" style={{ width: `${((l / LIFE) * 100).toFixed(1)}%` }}></i>
        </Book>
      </div>
      {NL4}
      <div className="cap">
        <span className="cap-l">
          {/* craft pass: the final hours read to the minute */}
          <span className="t">{`${l < LAST ? clock(l) : short(l)} left`}</span>
          <span className="meta">
            <i className="m-o" title="Opened by others">
              <PillIcon paths={EYE} />
              <b data-o="">{fmt(s.opens)}</b>
            </i>
            <i className="m-v" title="Timehearts: people keeping it">
              <PillIcon paths={HEART + HANDS} />
              <b data-v="">{fmt(s.saves)}</b>
            </i>
          </span>
        </span>
      </div>
    </>
  );
}

function Vacant({ s, run }: { s: Spot; run?: Spot[] }) {
  const lane = s.vacant ? s.lane : undefined;
  /* craft pass: open spots side by side are one quiet slot; tapping it offers the first */
  const last = run && run[run.length - 1];
  const nos = last ? `No. ${pad(numOf(s))}–${pad(numOf(last))}` : `No. ${pad(numOf(s))}`;
  return (
    <>
      <div className="stand">
        <button
          className="book vbook"
          aria-label={`Open Spot ${numOf(s)}${lane ? `, ${LANE[lane]}` : ""}${run ? `, one of ${run.length} in a row` : ""}. ${OPEN_SPOT.head} ${OPEN_SPOT.cta}: ${COST} for 72 hours`}
        >
          <span>{run ? OPEN_SPOT.many(run.length) : "Open Spot"}</span>
          <small className="v-h">{run ? BRAND.creator : OPEN_SPOT.head}</small>
          <em className="v-cta">{OPEN_SPOT.cta}</em>
        </button>
      </div>
      {NL4}
      <div className="cap">
        <strong className="vno">{nos}</strong>
        {/* the live wall numbers each lane, so an open spot says which lane it is in */}
        {lane && <span className="v2">{LANE[lane]}</span>}
      </div>
    </>
  );
}

type TileProps = {
  s: Spot;
  open: boolean;
  /* Not read directly: they change when the spot's counters or the minute do,
     so the memoised tile re-renders then (the spot object is mutated in place). */
  opens?: number;
  saves?: number;
  minute: number;
  compact?: boolean;
  /** when the visitor's previous visit was (tiles newer than that get the new dot) */
  since?: number;
  /** craft pass: shown two by two, as a Hotspot */
  big?: boolean;
  /** craft pass: the open spots this one stands for, itself first */
  run?: Spot[];
};

/** One spot on the wall (§6): a filled tile or an open spot. */
export const Tile = memo(function Tile({ s, open, compact, since, big, run }: TileProps) {
  return (
    <div
      className={`spot${s.vacant ? " vacant" : ""}${open ? " open" : ""}${big ? " big" : ""}${run ? " run" : ""}`}
      id={`s-${pad(s.no)}`}
      data-no={s.no}
      data-nos={run ? run.map((r) => r.no).join(" ") : undefined}
      data-phase={s.vacant ? undefined : phase(s)}
      style={cssVars(spotStyle(s))}
    >
      {s.vacant ? <Vacant s={s} run={run} /> : <Filled s={s} open={open} compact={compact} since={since} big={big} />}
    </div>
  );
});

/**
 * The canonical spot: exactly the tile the wall shows, from the same data and
 * styles, for anywhere else it appears (the Create preview, share cards, the
 * discovery page). Only the width is the caller's; everything inside is the
 * wall's own.
 */
export function SpotTile({ s, width }: { s: FilledSpot; width?: number }) {
  return (
    <div className="spot still" role="img" data-phase={phase(s)} style={{ ...cssVars(spotStyle(s)), ...(width ? { width } : {}) }} aria-label={`${s.name}, ${LANE[s.lane]}, spot ${numOf(s)}`}>
      <Filled s={s} open={false} still />
    </div>
  );
}

export function Filler() {
  return (
    <div className="spot filler">
      <div className="stand"></div>
    </div>
  );
}
