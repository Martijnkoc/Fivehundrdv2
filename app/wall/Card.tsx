"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { FREE, KEEP_ON, LANE, TOTAL, numOf, pad, type FilledSpot, type Spot } from "../../lib/wall/model";
import { provenance, type FindStatus, type Finds } from "../../lib/wall/retention";
import { callLine, statusLine, tierUp, TIER_NAME, type ScoutCall, type ScoutMe } from "../../lib/wall/scout";
import { numbersLine, type MakerNumbers } from "../../lib/site/reminderEmail";
import { standingLine, type EndedStory } from "../../lib/wall/again";
import { MAKER, SCOUT, SCOUTS, WALL_TODAY } from "../../lib/site/copy";
import { foundOrder, savesOrder, skey, type OrderedSave, type SaveEntry } from "../../lib/wall/saves";
import { age, left, short, styleFor } from "../../lib/wall/time";
import { bridge, wallStore } from "./store";
import { GenArt, cssVars } from "./Tile";

export type Account = { via: string; remind: boolean };
export type CardData = {
  seen: ReadonlySet<string | number>;
  saves: SaveEntry[];
  savesShown: number;
  account: Account | null;
  /** phones and tablets: the card is the Finds tab */
  finds?: boolean;
  /** "Your story": the maker's own numbers, by story id (live wall; people, without the maker); `edits`: changes made */
  makers?: Record<string, MakerNumbers & { edits?: number }>;
  /** "Your story" after its 72 hours: the newest ended story, with its final numbers (live wall) */
  ended?: EndedStory | null;
  /** live wall: open spots across every lane (the rack shows only some of them) */
  openSpots?: number;
  /** whether reminders are sent (false on the live wall until email is set up) */
  reminders?: boolean;
  /** each Find's history from the database, by story id (live wall) */
  history?: Finds;
  /** the signed-in Scout's card and calls (docs/scout.md); null until known or when signed out */
  scout?: ScoutMe | null;
  /** Your Wall Today: real reasons to look again (lib/wall/retention.ts, wallToday) */
  today?: { fresh: number; moving: number; ending: number };
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


/**
 * Approved change (2026-10-05): which of the maker's links people went to,
 * in people, when there's more than one link and someone went.
 */
function PerLink({ links, counts }: { links: { label: string; url: string }[]; counts?: number[] }) {
  if (!counts || links.length < 2 || !counts.some((n) => n > 0)) return null;
  return (
    <small className="mine-links">
      {`Per link: ${links.map((l, i) => `${l.label} ${(counts[i] ?? 0).toLocaleString("en-US")}`).join(" · ")}`}
    </small>
  );
}

/**
 * Approved change (2026-10-05): after its 72 hours, how the spot did: its
 * numbers in people, per link, and next to its lane in words (only with
 * enough spots to compare; lib/wall/again.ts, standingLine).
 */
function Report({ e }: { e: EndedStory }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const m = e.stats;
  const stats = (
    [
      ["Saw it", m.seen],
      ["Opened it", m.opened],
      [m.kept === 1 ? "Timeheart" : "Timehearts", m.kept],
      ["To your links", m.clicked],
      ["Shared it", m.shared],
    ] as const
  ).filter(([, v]) => v > 0);
  const standing = standingLine(e.standing, LANE[e.lane]);
  if (!stats.length && !m.hotAt) return <small className="mine-nums">{MAKER.endedEmpty}</small>;
  return (
    <div className="rep">
      {stats.length > 0 && (
        <dl className="rep-n">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{n(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {m.hotAt && <small className="rep-l">{MAKER.wasHot}</small>}
      {standing && <small className="rep-l">{standing}</small>}
      <PerLink links={e.links} counts={m.links} />
    </div>
  );
}

/** One save: a small square in the wall tile's visual language (§11). */
/**
 * Approved change: under "Your story", how the maker's own spot is doing,
 * in people (docs/retention.md). Only the maker sees it; never a rank.
 */
function MakerLine({ nums, final }: { nums: MakerNumbers; final?: boolean }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const parts = [
    nums.hotAt && "Hotspot",
    nums.seen > 0 && `${n(nums.seen)} saw it`,
    nums.opened > 0 && `${n(nums.opened)} opened`,
    nums.kept > 0 && `${n(nums.kept)} ${nums.kept === 1 ? "Timeheart" : "Timehearts"}`,
    nums.clicked > 0 && `${n(nums.clicked)} to your links`,
    nums.shared > 0 && `${n(nums.shared)} shared`,
  ].filter(Boolean) as string[];
  const line = numbersLine(nums);
  return (
    <>
      <small className="mine-nums" title={line ? `${final ? "In its 72 hours" : "So far"}, ${line}.` : undefined}>
        {parts.length ? parts.join(" · ") : final ? MAKER.endedEmpty : "Live now. Your first numbers show up here."}
      </small>
      {nums.kept > 0 && <small className="mine-kept">{MAKER.kept(n(nums.kept), nums.kept === 1)}</small>}
    </>
  );
}

function SaveTile({ x, f, call }: { x: OrderedSave; f?: FindStatus; call?: ScoutCall }) {
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
  /* Scout: the call's own line when signed in (lib/wall/scout.ts); otherwise
     this browser's history (lib/wall/retention.ts) */
  const p = call ? callLine(call) : provenance(x, f);
  const rank = p ? (
    <span className={`sq-r${p.kind === "rank" ? "" : " " + p.kind}`} title={p.title}>
      {p.text}
    </span>
  ) : null;
  const inner = (
    <>
      <span className="sq-art">{art}</span>
      {tl}
      <span className="sq-n">{x.name}</span>
      {rank}
    </>
  );
  const label = `${x.name}, ${LANE[x.lane]}, No. ${pad(x.num ?? x.no)}${x.liveNow ? "" : ", ended"}`;
  const tile = x.liveNow ? (
    <button className="sq" data-go={cur.no} title={label} aria-label={label}>
      {inner}
    </button>
  ) : x.link ? (
    <a className="sq" href={x.link.url} target="_blank" rel="sponsored noopener" title={`${label}. Find them on ${x.link.label}`} aria-label={label}>
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
      <button className="sv-x" data-unsave={x.k} aria-label={`Let ${x.name} go from your Scouts`}>
        &times;
      </button>
    </li>
  );
}

/** §11: the Scouts (your history), leaving first or as you found them; 12 at a time. */
/* craft pass: the order you last chose, remembered on this device */
const ORDER_KEY = "fh-finds-order";
function readOrder(): "leaving" | "found" {
  try {
    return localStorage.getItem(ORDER_KEY) === "found" ? "found" : "leaving";
  } catch {
    return "leaving";
  }
}

function Saves({ card, wall }: { card: CardData; wall: Spot[] }) {
  /* craft pass: Finds are your discovery history; read them by what leaves first, or by when you found them */
  const [order, setOrder] = useState(readOrder);
  const choose = (o: "leaving" | "found") => {
    setOrder(o);
    try {
      localStorage.setItem(ORDER_KEY, o);
    } catch {}
  };
  const all = (order === "found" ? foundOrder : savesOrder)(card.saves, wall),
    shown = all.slice(0, card.savesShown);
  const calls = new Map((card.scout?.list ?? []).map((c) => [c.id, c] as const));
  return (
    <div className="sv-box">
      <div className="sv-head">
        <span>{SCOUTS.head}</span>
        <b>{all.length}</b>
      </div>
      <p className="sv-sub">{SCOUTS.sub}</p>
      {!card.account && all.length > 0 && <p className="sv-local">{SCOUTS.local}</p>}
      {all.length > 1 && (
        <div className="sv-order" role="radiogroup" aria-label="Order your Scouts">
          <button type="button" role="radio" aria-checked={order === "leaving"} onClick={() => choose("leaving")}>
            Leaving first
          </button>
          <button type="button" role="radio" aria-checked={order === "found"} onClick={() => choose("found")}>
            As you found them
          </button>
        </div>
      )}
      {!all.length ? (
        <div className="sv-empty">
          <p>
            <b>{SCOUT.startsHead}</b> {SCOUT.startsBody}
          </p>
          <button type="button" className="sv-explore" data-explore="">
            {SCOUTS.explore}
          </button>
        </div>
      ) : (
        <>
          <ul className="sv-list">
            {shown.map((x) => {
              const id = x.cur && !x.cur.vacant && x.cur.id ? x.cur.id : x.k;
              return <SaveTile key={x.k} x={x} f={card.history?.[id]} call={calls.get(id)} />;
            })}
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
      {card.account && <p className="kept">{`Signed in with ${card.account.via}.${card.account.remind && card.reminders !== false ? " Reminders on." : ""}`}</p>}
    </div>
  );
}

const MOVE_KEY = "fh-scout-move";
/* a tier move is said on the first visit after it, for that whole visit (the card is rebuilt often) */
let moveSeenBefore: number | null = null;
const lastMoveSeen = () => {
  if (moveSeenBefore != null) return moveSeenBefore;
  try {
    return (moveSeenBefore = Number(localStorage.getItem(MOVE_KEY) || 0));
  } catch {
    return (moveSeenBefore = 0);
  }
};

/**
 * The Scout Card (docs/scout.md): proof of taste, not a dashboard. Signed
 * out, what signing in is for; signed in, where you stand (only what is
 * real), what your Scouts add up to, your strongest call, and sharing. The
 * outline is the tier's ink. A tier move is said once, quietly.
 */
function ScoutCard({ card }: { card: CardData }) {
  const me = card.scout;
  const move = me?.moves.find((m) => m.id > lastMoveSeen() && tierUp(m.from, m.to));
  useEffect(() => {
    if (!move) return;
    try {
      if (Number(localStorage.getItem(MOVE_KEY) || 0) >= move.id) return;
      localStorage.setItem(MOVE_KEY, String(move.id));
    } catch {}
    bridge.actions.scoutMoveSeen?.(move.id);
  }, [move?.id]);
  if (!card.account)
    return (
      <div className="sc-card sc-out">
        <h2 className="lc-h">{SCOUT.pitchHead}</h2>
        {SCOUT.pitch.map((l) => (
          <p className="sc-pitch" key={l}>
            {l}
          </p>
        ))}
        <ul className="sc-tiers" aria-label="Scout tiers">
          {SCOUT.tiers.map(([top, name]) => (
            <li key={name} className={`t-${name.toLowerCase()}`}>
              <b>{top}</b> {name}
            </li>
          ))}
        </ul>
        <p className="sc-receipts">{SCOUT.receipts}</p>
        <button className="sc-cta" data-keep="">
          {SCOUT.start}
        </button>
      </div>
    );
  if (!me)
    return (
      <div className="sc-card">
        <h2 className="lc-h">
          {SCOUT.cardFallbackName}
          <span className="bdot">.</span>
        </h2>
        <p className="sc-pitch">{SCOUT.proven}</p>
      </div>
    );
  const status = statusLine(me);
  const facts = [
    `${me.calls.toLocaleString("en-US")} ${me.calls === 1 ? "Scout" : "Scouts"}`,
    me.early > 0 && `${me.early} Early ${me.early === 1 ? "Call" : "Calls"}`,
    me.hotspots > 0 && `${me.hotspots} became ${me.hotspots === 1 ? "a Hotspot" : "Hotspots"}`,
  ].filter(Boolean);
  const best = me.best;
  return (
    <div className="sc-card">
      <h2 className="lc-h">
        {me.name || SCOUT.cardFallbackName}
        <span className="bdot">.</span>
      </h2>
      <p className="sc-proven">{SCOUT.proven}</p>
      <p className={`sc-status${me.status === "building" ? " building" : ""}`}>
        <b>{status.head}</b>
        {status.sub && <span>{status.sub}</span>}
      </p>
      {move && move.to && (
        <div className="sc-move" role="status">
          <p className="sc-move-h">{SCOUT.moveHead}</p>
          <p>
            <b>{SCOUT.moveTier(TIER_NAME[move.to].replace(" Scout", ""))}</b>{" "}
            {SCOUT.moveTop(move.to === "gold" ? 3 : move.to === "silver" ? 10 : 25)}
          </p>
          <p>{SCOUT.moveLine}</p>
          <div className="sc-move-acts">
            <button type="button" className="sc-link" data-go-scouts="">
              {SCOUT.seeScouts}
            </button>
            <button type="button" className="sc-link" data-scout-share="">
              {SCOUT.shareYours}
            </button>
          </div>
        </div>
      )}
      {/* no calls yet: "Your Scouts" below says how to start, once is enough */}
      {me.calls > 0 && <p className="sc-facts">{facts.join(" · ")}</p>}
      {best && (
        <div className="sc-best">
          <span>{SCOUT.strongest}</span>
          <b>{best.name}</b>
          <em>{`Found #${best.position} · ${(best.finalKeepers ?? best.keepersNow).toLocaleString("en-US")} kept it${best.breakout === "hotspot" ? " · a Hotspot" : ""}`}</em>
          <button type="button" className="sc-link" data-share-call={best.id}>
            {SCOUT.shareCall}
          </button>
        </div>
      )}
      <div className="sc-acts">
        <button type="button" className="sc-cta" data-scout-share="">
          {SCOUT.share}
        </button>
        {me.share && (
          <button type="button" className="sc-link" data-scout-unshare="">
            Stop sharing
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Your Wall Today: real reasons to look again, from this visitor's own
 * Scouts and the wall (lib/wall/retention.ts, wallToday). Only lines that are
 * true today; nothing at all when there's nothing to say.
 */
function WallToday({ today }: { today?: CardData["today"] }) {
  if (!today) return null;
  const lines = [
    today.fresh > 0 && `${today.fresh} new ${today.fresh === 1 ? "spot" : "spots"} since your last visit`,
    today.moving > 0 && `${today.moving} of your Scouts gained Timehearts while you were away`,
    today.ending > 0 && `${today.ending} of your Scouts ${today.ending === 1 ? "ends" : "end"} within 6 hours`,
  ].filter(Boolean) as string[];
  if (!lines.length) return null;
  return (
    <div className="lc-today">
      <p className="lc-today-h">
        <b>{WALL_TODAY.head}</b> {WALL_TODAY.sub}
      </p>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function CardBody({ card, wall }: { card: CardData; wall: Spot[] }) {
  const live = wall.filter((s): s is FilledSpot => !s.vacant && left(s) > 0),
    vac = card.openSpots ?? TOTAL - live.length;
  const next = live.reduce<FilledSpot | null>((a, s) => (!a || left(s) < left(a) ? s : a), null);
  const mine = live.filter((s) => s.mine).sort((a, b) => b.start - a.start)[0];
  const day = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
  const tier = card.account && card.scout && ["gold", "silver", "bronze"].includes(card.scout.status) ? card.scout.status : null;
  const mineNums = mine?.id ? card.makers?.[mine.id] : undefined;
  /* fix it in the first hour (live wall, the maker's own numbers known), at most 10 changes */
  const fixLeft = mine && mineNums ? 3600e3 - age(mine) : 0;
  return (
    <>
      <button
        className="sheet-handle"
        type="button"
        aria-label="Close your Scout Card"
        onClick={() => (document.getElementById("cardVeil") as HTMLElement).click()}
      ></button>
      <div className={`lc${tier ? " tier-" + tier : ""}`} data-tier={tier ?? undefined}>
        <div className="lc-top">
          <span>Scout Card</span>
          <span>{day}</span>
        </div>
        <ScoutCard card={card} />
        <WallToday today={card.today} />
        {mine && (
          <>
            <button className="lc-row mine" data-go={mine.no}>
              <span>Your story</span>
              <b>{`No. ${pad(numOf(mine))} ${mine.name}`}</b>
              <em>{`${short(left(mine))} left`}</em>
              <MakerLine
                nums={mineNums || { seen: 0, opened: mine.opens ?? 0, kept: mine.saves ?? 0, clicked: 0, shared: 0, hotAt: null }}
              />
              <PerLink links={mine.links} counts={mineNums?.links} />
            </button>
            {mine.id && card.makers && (
              <div className="mine-acts">
                {fixLeft > 0 && (mineNums?.edits ?? 0) < 10 && (
                  <button type="button" className="mine-again mine-fix" data-edit={mine.id}>
                    {MAKER.fix(Math.max(1, Math.ceil(fixLeft / 60e3)))}
                  </button>
                )}
                <button type="button" className="mine-again mine-share" data-share-mine={mine.id}>
                  {MAKER.share}
                </button>
              </div>
            )}
            {/* its last 24 hours: the same number for 72 more (free spots; paid renewal comes with Stripe) */}
            {FREE && mine.id && left(mine) > 0 && left(mine) <= KEEP_ON && (
              <button type="button" className="mine-again mine-extend" data-extend={mine.id}>
                {MAKER.extend}
              </button>
            )}
          </>
        )}
        {/* after its 72 hours: how it did, and the same story on the wall again (a new spot, paid again) */}
        {!mine && card.ended && (
          <div className="lc-row mine ended">
            <span>Your story</span>
            <b>{`No. ${pad(card.ended.no)} ${card.ended.name}`}</b>
            <em>{MAKER.ended}</em>
            <Report e={card.ended} />
            <button type="button" className="mine-again" data-again={card.ended.id}>
              {MAKER.again}
            </button>
          </div>
        )}
        <Saves card={card} wall={wall} />
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
      </div>
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

/** §10: how many Scouts, on the tab bar. */
export function TabBadge() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const n = st.card ? st.card.saves.length : 0;
  return (
    <b className="tb-n" id="tbN" hidden={!n}>
      {n}
    </b>
  );
}
