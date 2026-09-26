/*
 * Needs attention: rules over the last 24 hours against the 7 days before
 * (per day), that only fire when there's enough volume for the difference to
 * mean something (docs/founder-dashboard.md). Pure, so it's tested.
 */
import { int, money, ms, pct } from "./format";
import type { Kpis, LaneRow, Ops, SpotRow } from "./types";

export type Alert = {
  id: string;
  level: "critical" | "warning" | "notice";
  title: string;
  detail: string;
  href: string;
};

export type AlertInputs = {
  day: Kpis;
  /** the 7 days before the last 24 hours, summed */
  week: Kpis;
  ops: Ops;
  lanes: LaneRow[];
  /** spots live in the last 24 hours, with their numbers for those hours */
  spots: SpotRow[];
  now?: number;
};

const perDay = (x: number) => x / 7;

export function evaluate({ day, week, ops, lanes, spots, now = Date.now() }: AlertInputs): Alert[] {
  const out: Alert[] = [];

  /* traffic down > 40% on a baseline of at least 50 visits a day */
  const baseVisits = perDay(week.visits);
  if (baseVisits >= 50 && day.visits < baseVisits * 0.6)
    out.push({
      id: "traffic-down",
      level: "warning",
      title: "Traffic is down",
      detail: `${int(day.visits)} visits in the last 24 hours, against ${int(baseVisits)} a day the week before (${pct(day.visits / baseVisits - 1)}).`,
      href: "/founder/growth?range=7d",
    });

  /* checkout conversion down > 50% with at least 10 checkouts started */
  const convNow = day.checkouts ? day.paid / day.checkouts : null;
  const convBase = week.checkouts ? week.paid / week.checkouts : null;
  if (day.checkouts >= 10 && convNow != null && convBase != null && convBase > 0 && convNow < convBase * 0.5)
    out.push({
      id: "checkout-down",
      level: "critical",
      title: "Checkout conversion dropped",
      detail: `${pct(convNow)} of started checkouts were paid in the last 24 hours, against ${pct(convBase)} the week before.`,
      href: "/founder/revenue?range=7d",
    });

  /* ingestion: silent for 30 minutes while visits arrive, or lagging */
  const lastEvent = ops.ingestion.lastEvent ? Date.parse(ops.ingestion.lastEvent) : 0;
  const lastVisit = ops.ingestion.lastVisit ? Date.parse(ops.ingestion.lastVisit) : 0;
  if (lastVisit && now - lastVisit < 10 * 60e3 && now - lastEvent > 30 * 60e3 && baseVisits >= 50)
    out.push({
      id: "ingestion-silent",
      level: "critical",
      title: "Events stopped arriving",
      detail: "Visits are coming in, but no opens, saves or shares were recorded in the last 30 minutes.",
      href: "/founder/operations",
    });
  else if ((ops.ingestion.lagMs ?? 0) > 5 * 60e3)
    out.push({
      id: "ingestion-lag",
      level: "warning",
      title: "Events are arriving late",
      detail: `Beacons reach the database ${ms(ops.ingestion.lagMs)} after they happen (median, last hour).`,
      href: "/founder/operations",
    });

  /* error rate > 2% on at least 100 requests */
  const req = ops.hours.reduce((a, h) => a + h.requests, 0);
  const err = ops.hours.reduce((a, h) => a + h.errors, 0);
  if (req >= 100 && err / req > 0.02)
    out.push({
      id: "errors",
      level: "critical",
      title: "Error rate is high",
      detail: `${pct(err / req)} of ${int(req)} API requests failed in the last 24 hours.`,
      href: "/founder/operations",
    });

  /* any Stripe webhook failure */
  if (ops.webhooks.failed24h > 0)
    out.push({
      id: "webhooks",
      level: "critical",
      title: "Stripe webhooks failed",
      detail: `${int(ops.webhooks.failed24h)} webhook ${ops.webhooks.failed24h === 1 ? "call" : "calls"} failed in the last 24 hours. Stripe retries, but paid spots may be waiting to go live.`,
      href: "/founder/operations",
    });

  /* a lane over 90% full */
  for (const l of lanes)
    if (l.live / 500 > 0.9)
      out.push({
        id: "lane-" + l.lane,
        level: "notice",
        title: `${l.label} is almost full`,
        detail: `${int(l.live)} of 500 spots are live. New makers will find few open numbers.`,
        href: `/founder/wall?lane=${l.lane}`,
      });

  /* Create completion down > 40% with at least 10 starts */
  const compNow = day.createStarts ? day.checkouts / day.createStarts : null;
  const compBase = week.createStarts ? week.checkouts / week.createStarts : null;
  if (day.createStarts >= 10 && compNow != null && compBase && compNow < compBase * 0.6)
    out.push({
      id: "create-down",
      level: "warning",
      title: "Fewer people finish Create",
      detail: `${pct(compNow)} of people who opened Create reached checkout, against ${pct(compBase)} the week before.`,
      href: "/founder/creators?range=7d",
    });

  /* share traffic > 3× its baseline, at least 20 visits */
  const baseShare = perDay(week.fromShares);
  if (day.fromShares >= 20 && day.fromShares > Math.max(1, baseShare) * 3)
    out.push({
      id: "share-spike",
      level: "notice",
      title: "Shared links are taking off",
      detail: `${int(day.fromShares)} visits came through shared spot links in the last 24 hours, ${(day.fromShares / Math.max(1, baseShare)).toFixed(1)}× the usual.`,
      href: "/founder/shares?range=today",
    });

  /* a spot opened far more often than the rest (≥ 50 impressions) */
  const rated = spots.filter((s) => s.impressions >= 50).map((s) => ({ s, r: s.opens / s.impressions }));
  if (rated.length >= 5) {
    const sorted = rated.map((x) => x.r).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const best = rated.sort((a, b) => b.r - a.r)[0];
    if (median > 0 && best.r > median * 3)
      out.push({
        id: "hot-spot",
        level: "notice",
        title: `No. ${best.s.no} is outperforming`,
        detail: `“${best.s.name}” is opened by ${pct(best.r)} of the people who see it, ${(best.r / median).toFixed(1)}× the typical spot.`,
        href: `/founder/spots/${best.s.id}`,
      });
  }

  /* chargebacks */
  if (day.disputes > 0)
    out.push({
      id: "disputes",
      level: "warning",
      title: "A payment was disputed",
      detail: `${money(day.disputes)} in chargebacks opened in the last 24 hours.`,
      href: "/founder/revenue?range=7d",
    });

  const rank = { critical: 0, warning: 1, notice: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
