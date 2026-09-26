import { createElement, memo, type CSSProperties } from "react";
import { artShapes } from "../../lib/wall/art";
import { BOOKMARK, EYE, LANE_ICON_PATHS } from "../../lib/wall/icons";
import { LANE, LIFE, PRICE, fmt, numOf, pad, type FilledSpot, type LaneId, type Palette, type Spot } from "../../lib/wall/model";
import { left, short, spotStyle } from "../../lib/wall/time";

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

/** The front of a tile: the maker's artwork, their logo, or (demo) a pattern. */
function Front({ s }: { s: FilledSpot }) {
  if (s.img) return <img src={s.img} alt="" />;
  if (s.logo)
    return (
      <span className="bk-logo">
        <img src={s.logo} alt="" />
      </span>
    );
  return <GenArt seed={s.seed} pal={s.pal} />;
}

/* Whitespace text nodes mirror the reference's markup, so inline layout
   (and with it every pixel) is unchanged. */
const NL6 = "\n      ";
const NL4 = "\n    ";

function Filled({ s, open }: { s: FilledSpot; open: boolean }) {
  const l = left(s),
    fresh = LIFE - l < 3 * 3600e3;
  return (
    <>
      <div className="stand">
        <button className="book" aria-expanded={open} aria-label={`${s.name}, ${LANE[s.lane]}, spot ${numOf(s)}`}>
          {NL6}
          <span className="bk-art">
            <Front s={s} />
          </span>
          {NL6}
          <span className="bk-strip">
            <b>{s.name}</b>
            <small>
              <LaneIcon lane={s.lane} />
              {LANE[s.lane]}
            </small>
          </span>
          {NL6}
          <span className="bk-no">{pad(numOf(s))}</span>
          {fresh && <i className="new" title="Joined in the last 3 hours"></i>}
          <i className="prog" style={{ width: `${((l / LIFE) * 100).toFixed(1)}%` }}></i>
        </button>
      </div>
      {NL4}
      <div className="cap">
        <span className="cap-l">
          <span className="t">{`${short(l)} left`}</span>
          <span className="meta">
            <i title="Opened by others">
              <PillIcon paths={EYE} />
              <b data-o="">{fmt(s.opens)}</b>
            </i>
            <i title="Saved by others">
              <PillIcon paths={BOOKMARK} />
              <b data-v="">{fmt(s.saves)}</b>
            </i>
          </span>
        </span>
      </div>
    </>
  );
}

function Vacant({ s }: { s: Spot }) {
  return (
    <>
      <div className="stand">
        <button className="book vbook" aria-label={`Spot ${numOf(s)} is open. Claim it for ${PRICE}`}>
          <span>Open spot</span>
        </button>
      </div>
      {NL4}
      <div className="cap">
        <strong className="vno">{`No. ${pad(numOf(s))}`}</strong>
        <span className="v2">{`Claim for ${PRICE}`}</span>
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
};

/** One spot on the wall (§6): a filled tile or an open spot. */
export const Tile = memo(function Tile({ s, open }: TileProps) {
  return (
    <div className={`spot${s.vacant ? " vacant" : ""}${open ? " open" : ""}`} id={`s-${pad(s.no)}`} data-no={s.no} style={cssVars(spotStyle(s))}>
      {s.vacant ? <Vacant s={s} /> : <Filled s={s} open={open} />}
    </div>
  );
});

export function Filler() {
  return (
    <div className="spot filler">
      <div className="stand"></div>
    </div>
  );
}
