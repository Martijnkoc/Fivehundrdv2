import { exportCreate, hasData, TZ } from "../../../../lib/founder/data";
import { dayOf } from "../../../../lib/founder/filters";
import { runExport, titleFor, viewFromParams, type Dataset, type Format } from "../../../../lib/founder/exports";
import { env, json } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

export const maxDuration = 120;

/*
 * Scheduled reports (vercel.json): the same export pipeline with a schedule
 * attached, so they appear in the Control Room's export history.
 *   daily   → yesterday: founder report (PDF)
 *   weekly  → last 7 days: founder report (PDF) and daily metrics (XLSX)
 *   monthly → last 30 days: financial workbook (XLSX) and founder report (PDF)
 * Sending them by email is one step on top of this (a provider and a list).
 */
const PLANS: Record<string, { view: Record<string, string>; jobs: [Dataset, Format][] }> = {
  daily: { view: { range: "custom" }, jobs: [["report", "pdf"]] },
  weekly: { view: { range: "7d" }, jobs: [["report", "pdf"], ["daily", "xlsx"]] },
  monthly: { view: { range: "30d" }, jobs: [["financial", "xlsx"], ["report", "pdf"]] },
};

export const GET = measured("/api/cron/reports", async (req: Request) => {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return json({ error: "not allowed" }, { status: 401 });
  if (!hasData()) return json({ error: "offline" }, { status: 503 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "daily";
  const plan = PLANS[kind];
  if (!plan) return json({ error: "kind" }, { status: 400 });
  const view = { ...plan.view };
  if (kind === "daily") {
    const y = dayOf(Date.now() - 864e5, TZ);
    Object.assign(view, { from: y, to: y });
  }
  const done: string[] = [];
  for (const [ds, format] of plan.jobs) {
    const id = await exportCreate({ createdBy: `schedule:${kind}`, title: titleFor(ds, viewFromParams(view)), kind: ds, format, params: { view }, schedule: kind });
    await runExport(id, ds, format, view);
    done.push(id);
  }
  return json({ kind, exports: done });
});
