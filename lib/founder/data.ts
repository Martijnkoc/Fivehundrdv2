import "server-only";
import { cache } from "react";
import { hasDatabase, rpc } from "../server/backend";
import { demo } from "./demo";
import { parseFilters, parsePeriod, type Filters, type Period, type View } from "./filters";
import type {
  Cohort,
  CreateFunnel,
  CreatorRow,
  DimRow,
  ExportRow,
  FeedItem,
  Kpis,
  LaneRow,
  Live,
  Ops,
  Point,
  SpotDetail,
  SpotRow,
  Transaction,
} from "./types";

/*
 * Everything the Control Room reads, on the server only. With the database
 * configured it calls the fd_* functions with the server key; with
 * FOUNDER_DEMO=1 (never in production) it answers from made-up data.
 */

export const TZ = process.env.FOUNDER_TZ || "Europe/Amsterdam";
/** The first day "All time" starts from (the wall's launch). */
const SINCE = process.env.FOUNDER_SINCE || "2026-09-01";

export const isDemo = () => process.env.FOUNDER_DEMO === "1" && process.env.VERCEL_ENV !== "production";
export const hasData = () => isDemo() || hasDatabase();

type Params = Record<string, string | string[] | undefined>;
export function viewOf(p: Params, now = Date.now()): View {
  return { period: parsePeriod(p, now, TZ, isDemo() ? demo.since(TZ) : SINCE), f: parseFilters(p) };
}

const fj = (f: Filters) => JSON.parse(JSON.stringify(f)) as Record<string, string>;

export const kpis = cache(async (from: string, to: string, fKey: string): Promise<Kpis> => {
  const f = JSON.parse(fKey) as Filters;
  if (isDemo()) return demo.kpis(from, to, f, TZ);
  return rpc<Kpis>("fd_kpis", { p_from: from, p_to: to, p_f: fj(f) });
});
/** The period's numbers and the previous period's (null for all time). */
export async function kpisFor(v: View): Promise<{ now: Kpis; prev: Kpis | null }> {
  const k = JSON.stringify(v.f);
  const [now, prev] = await Promise.all([
    kpis(v.period.from, v.period.to, k),
    v.period.prevFrom ? kpis(v.period.prevFrom, v.period.prevTo!, k) : Promise.resolve(null),
  ]);
  return { now, prev };
}

export const series = cache(async (from: string, to: string, bucket: "hour" | "day", fKey: string): Promise<Point[]> => {
  const f = JSON.parse(fKey) as Filters;
  if (isDemo()) return demo.series(from, to, bucket, f, TZ);
  return rpc<Point[]>("fd_series", { p_from: from, p_to: to, p_bucket: bucket, p_f: fj(f), p_tz: TZ });
});
export const seriesFor = (v: View) => series(v.period.from, v.period.to, v.period.bucket, JSON.stringify(v.f));
/** The previous period's series, for "compared with" lines. */
export const prevSeriesFor = (v: View) =>
  v.period.prevFrom ? series(v.period.prevFrom, v.period.prevTo!, v.period.bucket, JSON.stringify(v.f)) : Promise.resolve(null);

export async function lanes(v: View): Promise<LaneRow[]> {
  if (isDemo()) return demo.lanes(v.period.from, v.period.to, v.f, TZ);
  return rpc<LaneRow[]>("fd_breakdown", { p_dim: "lane", p_from: v.period.from, p_to: v.period.to, p_f: fj(v.f) });
}
export async function breakdown(v: View, dim: "source" | "medium" | "device" | "country" | "landing"): Promise<DimRow[]> {
  if (isDemo()) return demo.breakdown(dim, v.period.from, v.period.to, v.f, TZ);
  return rpc<DimRow[]>("fd_breakdown", { p_dim: dim, p_from: v.period.from, p_to: v.period.to, p_f: fj(v.f) });
}
export async function spots(v: View, sort = "opens", q = "", limit = 100, offset = 0): Promise<SpotRow[]> {
  if (isDemo()) return demo.spots(v.period.from, v.period.to, v.f, sort, q, limit, offset, TZ);
  return rpc<SpotRow[]>("fd_spots", {
    p_from: v.period.from,
    p_to: v.period.to,
    p_f: fj(v.f),
    p_sort: sort,
    p_q: q,
    p_limit: limit,
    p_offset: offset,
  });
}
export async function spot(id: string): Promise<SpotDetail | null> {
  if (isDemo()) return demo.spot(id, TZ);
  return rpc<SpotDetail | null>("fd_spot", { p_story: id });
}
export async function creators(v: View): Promise<CreatorRow[]> {
  if (isDemo()) return demo.creators(v.period.from, v.period.to, v.f, TZ);
  return rpc<CreatorRow[]>("fd_creators", { p_from: v.period.from, p_to: v.period.to, p_f: fj(v.f) });
}
export async function createFunnel(p: Period): Promise<CreateFunnel> {
  if (isDemo()) return demo.createFunnel(p.from, p.to, TZ);
  return rpc<CreateFunnel>("fd_create_funnel", { p_from: p.from, p_to: p.to });
}
export async function transactions(v: View): Promise<Transaction[]> {
  if (isDemo()) return demo.transactions(v.period.from, v.period.to, v.f, TZ);
  return rpc<Transaction[]>("fd_transactions", { p_from: v.period.from, p_to: v.period.to, p_f: fj(v.f) });
}
export async function cohorts(weeks = 12): Promise<Cohort[]> {
  if (isDemo()) return demo.cohorts(weeks, TZ);
  return rpc<Cohort[]>("fd_cohorts", { p_weeks: weeks, p_tz: TZ });
}
export async function feed(since: string, limit = 60): Promise<FeedItem[]> {
  if (isDemo()) return demo.feed(since, limit, TZ);
  return rpc<FeedItem[]>("fd_feed", { p_since: since, p_limit: limit });
}
export async function live(): Promise<Live> {
  if (isDemo()) return demo.live(TZ);
  return rpc<Live>("fd_live");
}
export async function ops(): Promise<Ops> {
  if (isDemo()) return demo.ops(TZ);
  return rpc<Ops>("fd_ops");
}

/* ---------- exports ---------- */

export type NewExport = { createdBy: string; title: string; kind: string; format: "csv" | "xlsx" | "pdf"; params: Record<string, unknown>; schedule?: string | null };
export async function exportCreate(e: NewExport): Promise<string> {
  if (isDemo())
    return demo.exportCreate({ created_by: e.createdBy, title: e.title, kind: e.kind, format: e.format, params: e.params, schedule: e.schedule ?? null }, TZ);
  return rpc<string>("export_create", { p_e: e });
}
export async function exportUpdate(id: string, e: Partial<Pick<ExportRow, "status" | "rows" | "bytes" | "path" | "error">>) {
  if (isDemo()) return demo.exportUpdate(id, e, TZ);
  await rpc("export_update", { p_id: id, p_e: e });
}
export async function exportList(): Promise<ExportRow[]> {
  if (isDemo()) return demo.exportList(TZ);
  return rpc<ExportRow[]>("export_list", { p_limit: 50 });
}
export async function exportGet(id: string): Promise<ExportRow | null> {
  if (isDemo()) return demo.exportGet(id, TZ);
  return rpc<ExportRow | null>("export_get", { p_id: id });
}

/* ---------- Needs attention ---------- */

/** The last 24 hours against the 7 days before, for the alert rules (lib/founder/alerts.ts). */
export async function alertInputs() {
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const dayV: View = {
    period: { range: "custom", from: iso(now - 864e5), to: iso(now), prevFrom: null, prevTo: null, bucket: "hour", tz: TZ, fromDay: "", toDay: "", label: "" },
    f: {},
  };
  const [day, week, o, l, s] = await Promise.all([
    kpis(iso(now - 864e5), iso(now), "{}"),
    kpis(iso(now - 8 * 864e5), iso(now - 864e5), "{}"),
    ops(),
    lanes(dayV),
    spots(dayV, "opens", "", 300),
  ]);
  return { day, week, ops: o, lanes: l, spots: s, now };
}
