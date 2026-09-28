import "server-only";
import { env, hasDatabase, storage } from "../server/backend";
import { opsLog } from "../server/ops";
import { evaluate } from "./alerts";
import * as data from "./data";
import { demo } from "./demo";
import { KIND_LABEL, LANE_LABEL, parseFilters, parsePeriod, type View } from "./filters";
import { phraseText } from "./feedText";
import type { ExportRow } from "./types";
import { toCsv } from "./csv";

/*
 * The export centre (and the scheduled reports, which are exports with a
 * schedule). Each export is a job: a row in `exports` (queued → running →
 * done | failed), the file in the private `exports` Storage bucket, and a
 * short-lived signed link to download it. Every dataset uses the view (range
 * and filters) it was started from.
 */

export const DATASETS = {
  spots: { label: "Spot performance", formats: ["csv", "xlsx"] },
  creators: { label: "Creators", formats: ["csv", "xlsx"] },
  transactions: { label: "Transactions", formats: ["csv", "xlsx"] },
  financial: { label: "Financial workbook", formats: ["xlsx"] },
  acquisition: { label: "Acquisition sources", formats: ["csv", "xlsx"] },
  shares: { label: "Share and referral performance", formats: ["csv", "xlsx"] },
  cohorts: { label: "Retention cohorts", formats: ["csv", "xlsx"] },
  daily: { label: "Daily metrics", formats: ["csv", "xlsx"] },
  events: { label: "Raw events (latest 500)", formats: ["csv", "xlsx"] },
  report: { label: "Founder report", formats: ["pdf", "xlsx"] },
} as const;
export type Dataset = keyof typeof DATASETS;
export type Format = "csv" | "xlsx" | "pdf";

type Col = { key: string; label: string; kind?: "money" | "pct" | "int" | "date" | "text" };
export type Table = { name: string; cols: Col[]; rows: Record<string, unknown>[] };

export function viewFromParams(p: Record<string, string>): View {
  return data.viewOf(p);
}

export function titleFor(ds: Dataset, v: View) {
  const f = v.f;
  const bits = [
    f.lane && LANE_LABEL[f.lane],
    f.kind && KIND_LABEL[f.kind],
    f.visitor && `${f.visitor} visitors`,
    f.source && `from ${f.source}`,
    f.device,
    f.country,
  ].filter(Boolean);
  return `${DATASETS[ds].label} · ${v.period.label}${bits.length ? " · " + bits.join(", ") : ""}`;
}

const cents = (n: unknown) => (n == null ? null : Number(n) / 100);

/** The tables a dataset consists of (one sheet each in XLSX; the first one in CSV). */
export async function tablesFor(ds: Dataset, v: View): Promise<Table[]> {
  switch (ds) {
    case "spots":
    case "shares": {
      const rows = await data.spots(v, ds === "shares" ? "shares" : "opens", "", 1000);
      return [
        {
          name: ds === "shares" ? "Shares" : "Spots",
          cols: [
            { key: "no", label: "No.", kind: "int" },
            { key: "name", label: "Spot" },
            { key: "lane", label: "Lane" },
            { key: "status", label: "Status" },
            { key: "creator", label: "Creator" },
            { key: "startsAt", label: "Live from", kind: "date" },
            { key: "endsAt", label: "Expires", kind: "date" },
            { key: "impressions", label: "Impressions", kind: "int" },
            { key: "viewers", label: "Unique viewers", kind: "int" },
            { key: "opens", label: "Opens", kind: "int" },
            { key: "openRate", label: "Open rate", kind: "pct" },
            { key: "saves", label: "Saves", kind: "int" },
            { key: "saveRate", label: "Save rate", kind: "pct" },
            { key: "shares", label: "Shares", kind: "int" },
            { key: "shareRate", label: "Share rate", kind: "pct" },
            { key: "clicks", label: "Outbound clicks", kind: "int" },
            { key: "ctr", label: "Outbound CTR", kind: "pct" },
            { key: "shareVisits", label: "Visits from shares", kind: "int" },
            { key: "revenue", label: "Revenue (USD)", kind: "money" },
            { key: "id", label: "Story id" },
          ],
          rows: rows.map((r) => ({
            ...r,
            lane: LANE_LABEL[r.lane] ?? r.lane,
            openRate: r.impressions ? r.opens / r.impressions : null,
            saveRate: r.opens ? r.saves / r.opens : null,
            shareRate: r.opens ? r.shares / r.opens : null,
            ctr: r.opens ? r.clicks / r.opens : null,
            revenue: cents(r.revenue),
          })),
        },
      ];
    }
    case "creators": {
      const rows = (await data.creators(v)).filter((r) => r.spotsInPeriod > 0);
      return [
        {
          name: "Creators",
          cols: [
            { key: "creator", label: "Creator" },
            { key: "spotsInPeriod", label: "Spots in period", kind: "int" },
            { key: "spots", label: "Spots ever", kind: "int" },
            { key: "revenue", label: "Revenue (USD)", kind: "money" },
            { key: "opens", label: "Opens", kind: "int" },
            { key: "saves", label: "Saves", kind: "int" },
            { key: "lanes", label: "Lanes" },
            { key: "firstAt", label: "First spot", kind: "date" },
            { key: "lastAt", label: "Last spot", kind: "date" },
          ],
          rows: rows.map((r) => ({ ...r, revenue: cents(r.revenue), lanes: r.lanes.map((l) => LANE_LABEL[l] ?? l).join(", ") })),
        },
      ];
    }
    case "transactions":
      return [await transactionsTable(v)];
    case "financial": {
      const [{ now: k }, tx, lanes, s] = await Promise.all([data.kpisFor(v), transactionsTable(v), data.lanes(v), data.seriesFor(v)]);
      const net = k.gross - k.refunds - k.fees - k.disputes;
      return [
        {
          name: "Summary",
          cols: [
            { key: "line", label: "Line" },
            { key: "value", label: "USD", kind: "money" },
            { key: "note", label: "Note" },
          ],
          rows: [
            { line: "Gross revenue", value: cents(k.gross), note: `${k.paid} payments made in the period` },
            { line: "Refunds", value: cents(-k.refunds), note: "refunded in the period" },
            { line: "Chargebacks", value: cents(-k.disputes), note: "disputes opened in the period" },
            { line: "Stripe fees", value: cents(-k.fees), note: "from each payment's balance transaction" },
            { line: "Net revenue", value: cents(net), note: "gross − refunds − chargebacks − fees" },
            { line: "Average order value", value: k.paid ? cents(k.gross / k.paid) : null, note: "" },
            { line: "Revenue per visitor", value: k.visitors ? cents((k.gross - k.refunds) / k.visitors) : null, note: `${k.visitors} visitors` },
            { line: "Revenue per creator", value: k.creators ? cents((k.gross - k.refunds) / k.creators) : null, note: `${k.creators} creators` },
            { line: "Revenue per live spot", value: k.liveSpots ? cents((k.gross - k.refunds) / k.liveSpots) : null, note: `${k.liveSpots} live at the end` },
            { line: "Checkout conversion", value: null, note: k.checkouts ? `${((100 * k.paid) / k.checkouts).toFixed(1)}% (${k.paid} of ${k.checkouts})` : "—" },
          ],
        },
        tx,
        {
          name: "By lane",
          cols: [
            { key: "label", label: "Lane" },
            { key: "paid", label: "Spots sold", kind: "int" },
            { key: "revenue", label: "Revenue after refunds (USD)", kind: "money" },
            { key: "live", label: "Live now", kind: "int" },
          ],
          rows: lanes.map((l) => ({ ...l, revenue: cents(l.revenue) })),
        },
        {
          name: "By day",
          cols: [
            { key: "t", label: v.period.bucket === "hour" ? "Hour" : "Day" },
            { key: "checkouts", label: "Checkouts started", kind: "int" },
            { key: "paid", label: "Payments", kind: "int" },
            { key: "gross", label: "Gross (USD)", kind: "money" },
          ],
          rows: s.map((x) => ({ ...x, t: x.t.replace("T00:00", ""), gross: cents(x.gross) })),
        },
      ];
    }
    case "acquisition": {
      const dims = ["source", "medium", "device", "country", "landing"] as const;
      const all = await Promise.all(dims.map((d) => data.breakdown(v, d)));
      return dims.map((d, i) => ({
        name: d[0].toUpperCase() + d.slice(1),
        cols: [
          { key: "key", label: d[0].toUpperCase() + d.slice(1) },
          { key: "visitors", label: "Visitors", kind: "int" as const },
          { key: "visits", label: "Visits", kind: "int" as const },
          { key: "new_visits", label: "New visits", kind: "int" as const },
          { key: "opens", label: "Opens", kind: "int" as const },
        ],
        rows: all[i],
      }));
    }
    case "cohorts": {
      const rows = await data.cohorts(26);
      return [
        {
          name: "Cohorts",
          cols: [
            { key: "week", label: "First visit week" },
            { key: "size", label: "People", kind: "int" },
            { key: "d1", label: "Back day 1", kind: "int" },
            { key: "d7", label: "Back within 7 days", kind: "int" },
            { key: "d30", label: "Back within 30 days", kind: "int" },
            ...Array.from({ length: 8 }, (_, k) => ({ key: `w${k + 1}`, label: `Active week ${k + 1}`, kind: "int" as const })),
          ],
          rows: rows.map((r) => ({ ...r, ...Object.fromEntries((r.weeks ?? []).map((n, k) => [`w${k + 1}`, n])) })),
        },
      ];
    }
    case "daily": {
      const s = await data.seriesFor(v);
      return [
        {
          name: "Daily",
          cols: [
            { key: "t", label: v.period.bucket === "hour" ? "Hour" : "Day" },
            { key: "visitors", label: "Visitors", kind: "int" },
            { key: "newVisitors", label: "New visitors", kind: "int" },
            { key: "visits", label: "Visits", kind: "int" },
            { key: "fromShares", label: "Visits from shares", kind: "int" },
            { key: "impressions", label: "Impressions", kind: "int" },
            { key: "opens", label: "Opens", kind: "int" },
            { key: "saves", label: "Saves", kind: "int" },
            { key: "shares", label: "Shares", kind: "int" },
            { key: "clicks", label: "Outbound clicks", kind: "int" },
            { key: "createStarts", label: "Started Create", kind: "int" },
            { key: "checkouts", label: "Checkouts", kind: "int" },
            { key: "paid", label: "Payments", kind: "int" },
            { key: "gross", label: "Gross (USD)", kind: "money" },
          ],
          rows: s.map((x) => ({ ...x, t: x.t.replace("T00:00", ""), gross: cents(x.gross) })),
        },
      ];
    }
    case "events": {
      const to = Date.parse(v.period.to);
      const items = (await data.feed(v.period.from, 5000)).filter((i) => Date.parse(i.at) < to);
      return [
        {
          name: "Events",
          cols: [
            { key: "at", label: "At (UTC)" },
            { key: "kind", label: "Kind" },
            { key: "what", label: "What happened" },
            { key: "lane", label: "Lane" },
            { key: "no", label: "No.", kind: "int" },
            { key: "name", label: "Spot" },
            { key: "source", label: "Source" },
            { key: "device", label: "Device" },
            { key: "country", label: "Country" },
            { key: "amount", label: "Amount (USD)", kind: "money" },
          ],
          rows: items.map((i) => ({ ...i, what: phraseText(i), lane: i.lane ? LANE_LABEL[i.lane] : null, amount: cents(i.amount) })),
        },
      ];
    }
    case "report": {
      const [daily, spots, fin] = await Promise.all([tablesFor("daily", v), tablesFor("spots", v), tablesFor("financial", v)]);
      return [fin[0], daily[0], { ...spots[0], rows: spots[0].rows.slice(0, 50), name: "Top spots" }, fin[2]];
    }
  }
}

async function transactionsTable(v: View): Promise<Table> {
  const tx = await data.transactions(v);
  return {
    name: "Transactions",
    cols: [
      { key: "paidAt", label: "Paid at (UTC)" },
      { key: "no", label: "No.", kind: "int" },
      { key: "name", label: "Spot" },
      { key: "lane", label: "Lane" },
      { key: "creator", label: "Creator" },
      { key: "currency", label: "Currency" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "fee", label: "Stripe fee", kind: "money" },
      { key: "refund", label: "Refund", kind: "money" },
      { key: "refundedAt", label: "Refunded at (UTC)" },
      { key: "dispute", label: "Chargeback", kind: "money" },
      { key: "disputeStatus", label: "Dispute status" },
      { key: "net", label: "Net", kind: "money" },
      { key: "paymentIntent", label: "Stripe payment intent" },
      { key: "session", label: "Stripe checkout session" },
      { key: "id", label: "Story id" },
    ],
    rows: tx.map((t) => ({
      ...t,
      lane: LANE_LABEL[t.lane] ?? t.lane,
      currency: t.currency.toUpperCase(),
      amount: cents(t.amount),
      fee: cents(t.fee),
      refund: cents(t.refund),
      dispute: cents(t.dispute),
      net: cents(t.net),
    })),
  };
}

/* ---------- formats ---------- */

export async function toXlsx(tables: Table[], title: string): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fivehundrd Control Room";
  wb.created = new Date();
  wb.title = title;
  for (const t of tables) {
    const ws = wb.addWorksheet(t.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = t.cols.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.min(44, Math.max(10, c.label.length + 2, ...t.rows.slice(0, 200).map((r) => String(r[c.key] ?? "").length + 2))),
      style: { numFmt: c.kind === "money" ? '"$"#,##0.00;[Red]-"$"#,##0.00' : c.kind === "pct" ? "0.0%" : c.kind === "int" ? "#,##0" : undefined },
    }));
    for (const r of t.rows) ws.addRow(Object.fromEntries(t.cols.map((c) => [c.key, c.kind === "date" && r[c.key] ? new Date(String(r[c.key])) : r[c.key] ?? null])));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1EEE7" } };
    if (t.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.cols.length } };
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/* ---------- the job ---------- */

const TYPES: Record<Format, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { data: b } = await storage().getBucket("exports");
  if (!b) await storage().createBucket("exports", { public: false });
  bucketReady = true;
}

async function save(path: string, body: Uint8Array, format: Format) {
  if (data.isDemo()) return demo.fileSave(path, body, TYPES[format], data.TZ);
  if (!hasDatabase() || !env.supabaseSecret) throw new Error("Storage isn't configured (SUPABASE_SECRET_KEY).");
  await ensureBucket();
  const { error } = await storage().from("exports").upload(path, body, { contentType: TYPES[format], upsert: true });
  if (error) throw new Error(error.message);
}

/** Runs an export job to the end. Never throws: failures are recorded on the job. */
export async function runExport(id: string, ds: Dataset, format: Format, view: Record<string, string>) {
  const t0 = performance.now();
  try {
    await data.exportUpdate(id, { status: "running" });
    const v = viewFromParams(view);
    const title = titleFor(ds, v);
    const tables = await tablesFor(ds, v);
    let body: Uint8Array;
    if (format === "csv") body = new TextEncoder().encode(toCsv(tables[0]));
    else if (format === "xlsx") body = await toXlsx(tables, title);
    else {
      const { renderReport } = await import("./report");
      body = await renderReport(await reportData(v), title);
    }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const path = `${ds}/${stamp}-${id.slice(0, 8)}.${format}`;
    await save(path, body, format);
    await data.exportUpdate(id, { status: "done", rows: tables.reduce((a, t) => a + t.rows.length, 0), bytes: body.byteLength, path });
    opsLog("export", true, { ms: Math.round(performance.now() - t0), message: `${ds}.${format}`, meta: { id } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await data.exportUpdate(id, { status: "failed", error: msg.slice(0, 500) }).catch(() => {});
    opsLog("export", false, { ms: Math.round(performance.now() - t0), message: `${ds}.${format}: ${msg}`, meta: { id } });
  }
}

/** Everything the PDF founder report shows. */
export async function reportData(v: View) {
  const [{ now: k, prev }, s, l, top, inputs] = await Promise.all([data.kpisFor(v), data.seriesFor(v), data.lanes(v), data.spots(v, "opens", "", 10), data.alertInputs()]);
  return { v, k, prev, s, lanes: l, top, alerts: evaluate(inputs) };
}
export type ReportData = Awaited<ReturnType<typeof reportData>>;

/** A short-lived download link (or, in the demo, the file itself). */
export async function download(e: ExportRow): Promise<{ url: string } | { body: Uint8Array; type: string } | null> {
  if (!e.path) return null;
  if (data.isDemo()) {
    const f = demo.fileGet(e.path, data.TZ);
    return f ? { body: f.body, type: f.type } : null;
  }
  const name = `fivehundrd-${e.kind}-${e.created_at.slice(0, 10)}.${e.format}`;
  const { data: d, error } = await storage().from("exports").createSignedUrl(e.path, 60, { download: name });
  return error || !d ? null : { url: d.signedUrl };
}

export const parseView = (p: unknown): Record<string, string> => {
  const o: Record<string, string> = {};
  if (p && typeof p === "object")
    for (const [k, val] of Object.entries(p as Record<string, unknown>)) if (typeof val === "string" && val.length < 100) o[k] = val;
  /* validated the same way the pages validate the address */
  parseFilters(o);
  parsePeriod(o, Date.now(), data.TZ, "2026-01-01");
  return o;
};
