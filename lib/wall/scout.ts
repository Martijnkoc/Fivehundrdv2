/*
 * Scout (docs/scout.md): what the database decides, in the same words, for
 * the card and the list. The formulas match supabase/migrations/…_scout.sql
 * (private.scout_value, private.scout_tier, private.settle_scout) and are
 * unit-tested against the same cases; the thresholds are private.scout_cfg().
 * Everything shown comes from real calls; nothing here invents a number.
 */

export const SCOUT = {
  earlyShare: 0.2,
  breakMin: 25,
  breakFactor: 3,
  growthCap: 6,
  hotBonus: 1.5,
  prior: 5,
  minSettled: 10,
  minAccountDays: 7,
  minPopulation: 200,
  gold: 0.03,
  silver: 0.1,
  bronze: 0.25,
} as const;

export type Tier = "gold" | "silver" | "bronze";
export type ScoutStatus = Tier | "scout" | "building";

/** A call as scout_me() returns it, with its story. */
export type ScoutCall = {
  id: string;
  lane: string;
  no: number;
  name: string;
  slug: string;
  artwork: string | null;
  logo: string | null;
  seed: number;
  pal: number;
  startsAt: string;
  endsAt: string;
  gone: boolean;
  calledAt: string;
  source: "signed_in" | "anonymous" | "migrated";
  scored: boolean;
  /** you were the position-th to keep it; keepersThen had before you */
  position: number;
  keepersThen: number;
  keepersNow: number;
  wasHot: boolean;
  breakout: "hotspot" | "grew" | null;
  breakoutAt: string | null;
  finalKeepers: number | null;
  early: boolean | null;
  settled: boolean;
  /** when the verdict was reached (older databases may not send it) */
  settledAt?: string | null;
  hidden: boolean;
};

export type ScoutMove = { id: number; from: Tier | null; to: Tier | null; percentile: number | null; at: string };

export type ScoutMe = {
  name: string | null;
  since: string;
  /** the share link's slug while the card is shared */
  share: string | null;
  status: ScoutStatus;
  percentile: number | null;
  calls: number;
  early: number;
  hotspots: number;
  settled: number;
  minSettled: number;
  best: ScoutCall | null;
  moves: ScoutMove[];
  list: ScoutCall[];
};

const TIER_ORDER: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 };
export const TIER_NAME: Record<Tier, string> = { gold: "Gold Scout", silver: "Silver Scout", bronze: "Bronze Scout" };

/** Broke out while live: became a Hotspot after the call, or grew to breakMin keepers and breakFactor × your position. */
export function breakoutOf(c: { wasHot: boolean; position: number; calledAt: number; hotAt: number | null; endsAt: number }, keepers: number) {
  if (!c.wasHot && c.hotAt != null && c.hotAt > c.calledAt && c.hotAt <= c.endsAt) return "hotspot" as const;
  if (keepers >= SCOUT.breakMin && keepers >= SCOUT.breakFactor * c.position) return "grew" as const;
  return null;
}

/** An Early Call: kept before it broke out, within the first earlyShare of its keepers, and it broke out. */
export function isEarly(c: { wasHot: boolean; breakout: string | null; position: number }, finalKeepers: number) {
  return !c.wasHot && c.breakout != null && c.position <= Math.ceil(SCOUT.earlyShare * finalKeepers);
}

/** One call's worth: 0 unless it was an Early Call; how early × how much it grew after you × the Hotspot bonus. */
export function callValue(c: { early: boolean | null; position: number; keepersThen: number; finalKeepers: number | null; breakout: string | null }) {
  const f = c.finalKeepers ?? 0;
  if (!c.early || f <= 0) return 0;
  const earliness = 1 - (c.position - 1) / f;
  const growth = Math.min(SCOUT.growthCap, Math.log2(1 + f / Math.max(1, c.keepersThen)));
  return earliness * growth * (c.breakout === "hotspot" ? SCOUT.hotBonus : 1);
}

/** Reputation over settled calls that count: Σ value × (early + 1) / (settled + prior). */
export function scoutScore(calls: { scored: boolean; settled: boolean; early: boolean | null; position: number; keepersThen: number; finalKeepers: number | null; breakout: string | null }[]) {
  const done = calls.filter((c) => c.scored && c.settled);
  const early = done.filter((c) => c.early).length;
  const value = done.reduce((a, c) => a + callValue(c), 0);
  return (value * (early + 1)) / (done.length + SCOUT.prior);
}

/**
 * The tier for a Scout with `higher` eligible Scouts scoring above them among
 * `n`: only with minPopulation Scouts and at least one Early Call. Top 3%
 * means your place (higher + 1) is within floor(3% of n), so a handful of
 * Scouts never makes a Gold one.
 */
export function tierFor(higher: number, n: number, early: number): Tier | null {
  if (n < SCOUT.minPopulation || early < 1) return null;
  const place = higher + 1;
  if (place <= Math.floor(SCOUT.gold * n)) return "gold";
  if (place <= Math.floor(SCOUT.silver * n)) return "silver";
  if (place <= Math.floor(SCOUT.bronze * n)) return "bronze";
  return null;
}

/** "Top 8%": your place as a share of eligible Scouts, rounded up (never flattering). */
export const percentileFor = (higher: number, n: number) => Math.ceil(((higher + 1) / n) * 100);

export const tierUp = (from: Tier | null, to: Tier | null) => (to ? TIER_ORDER[to] : 0) > (from ? TIER_ORDER[from] : 0);

const n = (v: number) => v.toLocaleString("en-US");

/** The card's one line about where you stand. */
export function statusLine(me: Pick<ScoutMe, "status" | "percentile" | "settled" | "minSettled">) {
  if (me.status === "building")
    return { head: "Building your Scout history", sub: `Your standing shows once ${me.minSettled} of your Scouts have had their 72 hours · ${me.settled} so far` };
  if (me.status === "scout") return { head: "Scout", sub: null };
  return { head: `Top ${me.percentile}%`, sub: TIER_NAME[me.status] };
}

/** The one line under a Scout in the list, from its call only. */
export function callLine(c: ScoutCall): { text: string; title: string; kind: "early" | "moving" | "called" | "ended" } {
  const before = c.source === "migrated" ? " Scouted before you signed in, so it doesn't count toward your Scout standing." : "";
  const then = `${n(c.keepersThen)} ${c.keepersThen === 1 ? "person" : "people"} had scouted it before you`;
  if (c.settled && c.early) {
    const now = c.finalKeepers ?? c.keepersNow;
    return c.breakout === "hotspot"
      ? { kind: "early", text: "Early Call · Hotspot", title: `Early Call: you were #${c.position} to scout it, before it became a Hotspot. ${then}; ${n(now)} scouted it.${before}` }
      : { kind: "early", text: `Early Call · #${c.position}`, title: `Early Call: you were #${c.position} to scout it. ${then}; ${n(now)} scouted it.${before}` };
  }
  if (!c.settled && c.breakout)
    return {
      kind: "moving",
      text: c.breakout === "hotspot" ? `#${c.position} · now a Hotspot` : `#${c.position} · now ${n(c.keepersNow)}`,
      title: `You were #${c.position} to scout it and it's moving. ${then}. Whether it's an Early Call is settled when its 72 hours end.${before}`,
    };
  if (c.settled) return { kind: "ended", text: `Scouted #${c.position}`, title: `You were #${c.position} to scout it. ${then}.${before}` };
  return { kind: "called", text: `#${c.position} · now ${n(c.keepersNow)}`, title: `You were #${c.position} to scout it. ${then}; ${n(c.keepersNow)} have scouted it now.${before}` };
}
