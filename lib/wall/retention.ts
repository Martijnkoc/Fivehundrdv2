/*
 * Retention on the visitor's side (docs/retention.md): the one line of
 * history under each Find, the one personal thing "since your last visit"
 * says, and Call it's daily allowance. The facts come from the database
 * (/api/finds → finds_status, supabase/migrations/…_retention.sql); this file
 * only chooses what to say, and says real numbers only.
 */
import { left } from "./time";
import type { FilledSpot, LaneId, Spot } from "./model";
import { skey, type OrderedSave } from "./saves";

/** One Find's history, as finds_status returns it. */
export type FindStatus = {
  id: string;
  savedAt: string | null;
  /** you were the rank-th person to save it; savers: everyone who ever did */
  rank: number;
  savers: number;
  /** people keeping it now (the tile's count) */
  saves: number;
  hotAt: string | null;
  endsAt: string | null;
  gone: boolean;
  early: boolean;
  /** rank: which caller you were (1 = the first to call it) */
  call: { calledAt: string; outcome: "hotspot" | "moved" | null; outcomeAt: string | null; savesThen: number; rank?: number } | null;
  back: { id: string; lane: LaneId; no: number; slug: string; name: string } | null;
};

export type Finds = Record<string, FindStatus>;

const n = (v: number) => v.toLocaleString("en-US");
const day = (t: number | string) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const ordinal = (k: number) => k + (k % 100 >= 11 && k % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] ?? "th");
const hoursBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 3600e3));

export type Provenance = { text: string; title: string; kind: "called" | "back" | "early" | "found" | "rank" };

/**
 * The one line under a Find, most meaningful first: a call that came true,
 * the maker back on the wall, found early, a call still open, when you found
 * something that has ended, and otherwise how early you were (#7 of 340).
 */
export function provenance(x: OrderedSave, f: FindStatus | undefined): Provenance | null {
  const call = f?.call;
  /* "Called 3rd": which caller you were, when the database knows */
  const nth = call?.rank ? ` ${ordinal(call.rank)}` : "";
  const who = call?.rank ? ` You were the ${ordinal(call.rank)} to call it.` : "";
  if (call?.outcome === "hotspot" && call.outcomeAt) {
    const h = hoursBetween(call.calledAt, call.outcomeAt);
    return h >= 1
      ? { kind: "called", text: `Called${nth} · ${h}h early`, title: `You called this ${h} ${h === 1 ? "hour" : "hours"} before it became a Hotspot.${who}` }
      : { kind: "called", text: `Called${nth} · before Hotspot`, title: `You called this before it became a Hotspot.${who}` };
  }
  if (call?.outcome === "moved" && f)
    return {
      kind: "called",
      text: `Called${nth} at ${n(call.savesThen)} · now ${n(f.saves)}`,
      title: `You called this when ${n(call.savesThen)} ${call.savesThen === 1 ? "person" : "people"} had kept it.${who} ${n(f.saves)} keep it now.`,
    };
  if (f?.back)
    return { kind: "back", text: "Maker is back", title: `${f.back.name} is back on the wall, at No. ${String(f.back.no).padStart(3, "0")}.` };
  if (f?.early) {
    const before = f.hotAt && f.savedAt && Date.parse(f.savedAt) < Date.parse(f.hotAt);
    const share = f.savers >= 20 ? Math.max(5, Math.ceil(((f.rank / f.savers) * 100) / 5) * 5) : null;
    return {
      kind: "early",
      text: `Found at ${n(f.rank)} · now ${n(f.saves)}`,
      title: before
        ? `You kept this before it became a Hotspot. You were the ${ordinal(f.rank)} to give it a Timeheart; ${n(f.saves)} keep it now.`
        : `You were the ${ordinal(f.rank)} to give this a Timeheart${share ? `, among the first ${share}% of the people who did` : ""}. ${n(f.saves)} keep it now.`,
    };
  }
  if (call && x.liveNow) return { kind: "called", text: `Called${nth} · ${day(call.calledAt)}`, title: `You called this on ${day(call.calledAt)}.${who}` };
  if (!x.liveNow) return { kind: "found", text: `Found ${day(x.savedAt)}`, title: `Gone from the wall. You found it on ${day(x.savedAt)}.` };
  const now = x.cur && !x.cur.vacant && x.cur.saves != null ? Math.max(x.cur.saves, x.rank ?? 0) : x.count;
  if (x.rank != null && now != null)
    return { kind: "rank", text: `#${x.rank} of ${now}`, title: `You were the ${ordinal(x.rank)} to give this a Timeheart. ${now} ${now === 1 ? "person has" : "people have"} now.` };
  return null;
}

/** The personal part of "since your last visit". `no`: the spot to open; none opens Finds. */
export type SinceItem = { kind: "breakout" | "called" | "ending" | "moving" | "back"; text: string; no?: number; story?: string };

/** "Ends soon" for Finds, as the Finds tile marks it. */
export const SOON = 6 * 3600e3;

/**
 * One thing that changed for you, most important first: something you
 * called became a Hotspot while you were away; a Find is about to end; Finds
 * that clearly gained saves since your last visit; a maker you found is back.
 * `prior`: each Find's save count as your last visit left it.
 */
export function personalItem(p: {
  saves: OrderedSave[];
  prior: Map<string, number | undefined>;
  finds: Finds;
  since: number;
  wall: Spot[];
  /** Scout (docs/scout.md): the signed-in Scout's calls; a breakout since the last visit comes first */
  scout?: {
    id: string;
    name: string;
    position: number;
    breakout: "hotspot" | "grew" | null;
    breakoutAt: string | null;
    hidden: boolean;
    early?: boolean | null;
    settledAt?: string | null;
  }[];
}): SinceItem | null {
  const byId = new Map<string, FilledSpot>();
  for (const s of p.wall) if (!s.vacant && s.id) byId.set(s.id, s);

  /* an Early Call is only said once it's settled (docs/copy.md) */
  const proved = (p.scout ?? [])
    .filter((c) => !c.hidden && c.early && c.settledAt && Date.parse(c.settledAt) > p.since)
    .sort((a, b) => Date.parse(b.settledAt!) - Date.parse(a.settledAt!))[0];
  if (proved)
    return { kind: "breakout", text: `You called it early. You were #${proved.position} to keep ${proved.name}`, story: proved.id };

  const broke = (p.scout ?? [])
    .filter((c) => !c.hidden && c.breakout && c.breakoutAt && Date.parse(c.breakoutAt) > p.since)
    .sort((a, b) => Date.parse(b.breakoutAt!) - Date.parse(a.breakoutAt!))[0];
  if (broke) {
    const s = byId.get(broke.id);
    return {
      kind: "breakout",
      text: `Something you Scouted is taking off: ${broke.name}${broke.breakout === "hotspot" ? " is a Hotspot" : ""}. You were #${broke.position}`,
      no: s && left(s) > 0 ? s.no : undefined,
      story: broke.id,
    };
  }
  const status = (x: OrderedSave) => p.finds[x.cur && !x.cur.vacant && x.cur.id ? x.cur.id : x.k];

  for (const x of p.saves) {
    const c = status(x)?.call;
    if (c?.outcome === "hotspot" && c.outcomeAt && Date.parse(c.outcomeAt) > p.since) {
      const s = x.liveNow ? (x.cur as FilledSpot) : undefined;
      return { kind: "called", text: "Something you called became a Hotspot", no: s?.no, story: s?.id };
    }
  }

  const ending = p.saves.filter((x) => x.liveNow && left(x.cur as FilledSpot) < SOON);
  if (ending.length) {
    const first = ending[0].cur as FilledSpot;
    const h = Math.max(1, Math.round(left(first) / 3600e3));
    return {
      kind: "ending",
      text: ending.length === 1 ? `1 of your Scouts ends in ${h}h` : `${ending.length} of your Scouts end within 6h`,
      no: first.no,
      story: first.id,
    };
  }

  const moving = p.saves.filter(isMoving(p.prior));
  if (moving.length)
    return {
      kind: "moving",
      text: moving.length === 1 ? "1 of your Scouts is moving" : `${moving.length} of your Scouts are moving`,
      ...(moving.length === 1 && { no: (moving[0].cur as FilledSpot).no, story: (moving[0].cur as FilledSpot).id }),
    };

  for (const x of p.saves) {
    const b = status(x)?.back;
    const s = b && byId.get(b.id);
    if (s && left(s) > 0) return { kind: "back", text: "A maker you found is back", no: s.no, story: s.id };
  }
  return null;
}

/**
 * The 10% who don't see the personal part, so the Control Room can tell
 * whether it changes anything. Fixed per visitor (their random id).
 */
export function inHoldout(visitor: string) {
  let h = 0;
  for (let i = 0; i < visitor.length; i++) h = (h * 31 + visitor.charCodeAt(i)) >>> 0;
  return h % 10 === 0;
}

/** A Scout that clearly gained Timehearts since the last visit (as `prior` left it): at least 5, and half again. */
const isMoving = (prior: Map<string, number | undefined>) => (x: OrderedSave) => {
  if (!x.liveNow) return false;
  const was = prior.get(x.k),
    now = (x.cur as FilledSpot).saves;
  return was != null && now != null && now - was >= Math.max(5, Math.ceil(was / 2));
};

/**
 * Your Wall Today (docs/copy.md): the real reasons to look again, each only
 * when it's more than zero. `fresh`: spots new since your last visit.
 */
export function wallToday(p: { saves: OrderedSave[]; prior: Map<string, number | undefined>; fresh: number }) {
  return {
    fresh: p.fresh,
    moving: p.saves.filter(isMoving(p.prior)).length,
    ending: p.saves.filter((x) => x.liveNow && left(x.cur as FilledSpot) < SOON).length,
  };
}
