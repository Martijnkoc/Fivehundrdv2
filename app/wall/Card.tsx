"use client";

import { Fragment, useSyncExternalStore } from "react";
import { BIND, LANE, LANES, TOTAL, lum, numOf, pad, seenKey, type FilledSpot, type Spot } from "../../lib/wall/model";
import { savesOrder, skey, type OrderedSave, type SaveEntry } from "../../lib/wall/saves";
import { left, short, styleFor } from "../../lib/wall/time";
import { wallStore } from "./store";
import { GenArt, LaneIcon, cssVars } from "./Tile";

export type Account = { via: string; remind: boolean };
export type CardData = {
  /** the entry spot's place on the wall (for Take me back) and its number */
  entryNo: number;
  entryNum?: number;
  seen: ReadonlySet<string | number>;
  saves: SaveEntry[];
  savesShown: number;
  account: Account | null;
  /** phones and tablets: the card is the Finds tab */
  finds?: boolean;
};

/* Whitespace text nodes as in the reference's renderCard template. */
const ws = (indent: number) => "\n" + " ".repeat(indent);

const initials = (name: string) =>
  String(name)
    .split(/\s+/)
    .filter((w) => /\w/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** One save: a small square in the wall tile's visual language (§11). */
function SaveTile({ x }: { x: OrderedSave }) {
  const cur = x.cur as FilledSpot;
  const st = x.liveNow ? styleFor(cur) : styleFor({ lane: x.lane, start: x.start, seed: 0 });
  const src: { img?: string | null; logo?: string | null; seed?: number; pal?: SaveEntry["pal"] } = x.liveNow ? cur : x;
  const art = src.img ? (
    <img src={src.img} alt="" />
  ) : src.logo ? (
    <span className="bk-logo">
      <img src={src.logo} alt="" />
    </span>
  ) : src.seed != null && src.pal ? (
    <GenArt seed={src.seed} pal={src.pal} />
  ) : (
    <span className="sq-ini">{initials(x.name)}</span>
  );
  const tl = x.liveNow ? (
    <span className={`sq-t${left(cur) < 6 * 3600e3 ? " soon" : ""}`}>{short(left(cur))}</span>
  ) : (
    <span className="sq-t off">Ended</span>
  );
  const inner = (
    <>
      <span className="sq-art">{art}</span>
      {tl}
      <span className="sq-n">{x.name}</span>
    </>
  );
  const label = `${x.name}, ${LANE[x.lane]}, No. ${pad(x.num ?? x.no)}${x.liveNow ? "" : ", ended"}`;
  const tile = x.liveNow ? (
    <button className="sq" data-go={cur.no} title={label} aria-label={label}>
      {inner}
    </button>
  ) : x.link ? (
    <a className="sq" href={x.link.url} target="_blank" rel="noopener" title={`${label}. Find them on ${x.link.label}`} aria-label={label}>
      {inner}
    </a>
  ) : (
    <span className="sq" title={label}>
      {inner}
    </span>
  );
  return (
    <li className={`msp${x.liveNow ? "" : " gone"}`} data-k={x.k} style={cssVars(st)}>
      {tile}
      <button className="sv-x" data-unsave={x.k} aria-label={`Remove ${x.name} from your saves`}>
        &times;
      </button>
    </li>
  );
}

/** §11: saves, leaving first; 12 at a time; the "Keep my card" nudge (§12). */
function Saves({ card, wall }: { card: CardData; wall: Spot[] }) {
  const all = savesOrder(card.saves, wall),
    shown = all.slice(0, card.savesShown);
  return (
    <div className="sv-box">
      <div className="sv-head">
        <span>{`${card.finds ? "Your finds" : "Your saves"}${all.length ? ", leaving first" : ""}`}</span>
        <b>{all.length}</b>
      </div>
      {!all.length ? (
        <p className="sv-empty">
          {card.finds ? "Nothing found yet. Tap Save on anything you like and it lands here, even after it leaves the wall." : "Nothing saved yet. Tap Save on a tile and it lands here."}
        </p>
      ) : (
        <>
          <ul className="sv-list">
            {shown.map((x) => (
              <SaveTile key={x.k} x={x} />
            ))}
          </ul>
          {all.length > card.savesShown ? (
            <button className="sv-more" data-more-saves="">
              {`Show ${Math.min(12, all.length - card.savesShown)} more`}
            </button>
          ) : all.length > 12 ? (
            <button className="sv-more" data-less-saves="">
              Show less
            </button>
          ) : null}
        </>
      )}
      {all.length > 0 && !card.account && (
        <div className="keep">
          <p>Take your card to every device, and we&apos;ll remind you before saved spots end.</p>
          <button data-keep="">Keep my card</button>
        </div>
      )}
      {card.account && <p className="kept">{`Card kept with ${card.account.via}.${card.account.remind ? " Reminders on." : ""}`}</p>}
    </div>
  );
}

function CardBody({ card, wall }: { card: CardData; wall: Spot[] }) {
  const live = wall.filter((s): s is FilledSpot => !s.vacant && left(s) > 0),
    vac = TOTAL - live.length;
  const next = live.reduce<FilledSpot | null>((a, s) => (!a || left(s) < left(a) ? s : a), null);
  const savedKeys = new Set(card.saves.map((x) => x.k));
  const seenLive = live.filter((s) => card.seen.has(seenKey(s))),
    saved = live.filter((s) => savedKeys.has(skey(s)));
  const mine = live.filter((s) => s.mine).sort((a, b) => b.start - a.start)[0];
  const day = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
  return (
    <>
      <button
        className="sheet-handle"
        type="button"
        aria-label="Close your card"
        onClick={() => (document.getElementById("cardVeil") as HTMLElement).click()}
      ></button>
      <div className="lc">
        {ws(4)}
        <div className="lc-top">
          <span>Fivehundrd card</span>
          <span>{day}</span>
        </div>
        {ws(4)}
        <h2 className="lc-h">
          Your wall today<span className="bdot">.</span>
        </h2>
        {ws(4)}
        <button className="lc-entry" data-go={card.entryNo}>
          <span>You walked in at</span>
          <b>{`No. ${pad(card.entryNum ?? card.entryNo)}`}</b>
          <em>Take me back</em>
        </button>
        {ws(4)}
        <div className="lc-stamps">
          {ws(6)}
          <div>
            <b>{seenLive.length}</b>
            <span>opened today</span>
          </div>
          {ws(6)}
          <div>
            <b>{saved.length}</b>
            <span>saved</span>
          </div>
          {ws(6)}
          <div>
            <b>{live.length - seenLive.length}</b>
            <span>still unseen</span>
          </div>
          {ws(4)}
        </div>
        {ws(4)}
        <div className="lc-lanes" aria-label="What you opened today, per lane">
          {LANES.map(([k, v]) => {
            const n = seenLive.filter((s) => s.lane === k).length,
              b = BIND[k];
            return (
              <span
                key={k}
                className={n ? "" : "zero"}
                style={cssVars(`--lb:${b.c1};--lt:${lum(b.c1) > 0.28 ? "#141210" : "#fbf5e6"}`)}
                title={`${v}: ${n} opened today`}
              >
                <LaneIcon lane={k} />
                {n}
              </span>
            );
          })}
        </div>
        {ws(4)}
        {mine && (
          <button className="lc-row mine" data-go={mine.no}>
            <span>Your story</span>
            <b>{`No. ${pad(numOf(mine))} ${mine.name}`}</b>
            <em>{`${short(left(mine))} left`}</em>
          </button>
        )}
        {ws(4)}
        <Saves card={card} wall={wall} />
        {ws(4)}
        <div className="lc-wall">
          <span>
            <b>{live.length}</b> live
          </span>
          <span>
            <b>{vac}</b> spots open
          </span>
          {next && (
            <span>
              Next spot frees up in <b>{short(left(next))}</b>
            </span>
          )}
        </div>
        {ws(2)}
      </div>
      {ws(2)}
      <p className="lc-help">The wall is a circle, so everyone starts somewhere else. Tap a tile to open it, tap it again to close.</p>
    </>
  );
}

/**
 * §10: the visitor's Fivehundrd card, in the desktop rail or the phone sheet.
 * Rebuilt on every change, as the reference's innerHTML was (the landing
 * animation classes and focus inside the card reset the same way).
 */
export function Card() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  if (!st.card) return null;
  return (
    <Fragment key={st.cardVersion}>
      <CardBody card={st.card} wall={st.wall} />
    </Fragment>
  );
}

/** §10: the save count on the tab bar's My card. */
export function TabBadge() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const n = st.card ? st.card.saves.length : 0;
  return (
    <b className="tb-n" id="tbN" hidden={!n}>
      {n}
    </b>
  );
}
