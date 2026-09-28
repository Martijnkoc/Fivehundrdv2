import { after } from "next/server";
import { founderFrom } from "../../../../lib/founder/auth";
import { exportCreate, exportList, hasData } from "../../../../lib/founder/data";
import { DATASETS, parseView, runExport, titleFor, viewFromParams, type Dataset, type Format } from "../../../../lib/founder/exports";
import { json } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

/* big exports run after the response, within this route's time budget */
export const maxDuration = 60;

/** The export history (the page polls it while jobs run). */
export async function GET(req: Request) {
  if (!(await founderFrom(req))) return json({ error: "sign in" }, { status: 401 });
  if (!hasData()) return json([]);
  return json(await exportList());
}

/** Starts an export job for a dataset, a format and the view (range and filters) it was asked from. */
export const POST = measured("/api/founder/exports", async (req: Request) => {
  const who = await founderFrom(req);
  if (!who) return json({ error: "sign in" }, { status: 401 });
  if (!hasData()) return json({ error: "no data source" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { dataset?: string; format?: string; view?: unknown };
  const ds = b.dataset as Dataset;
  const format = b.format as Format;
  if (!(ds in DATASETS) || !(DATASETS[ds].formats as readonly string[]).includes(format)) return json({ error: "That export isn't available in that format." }, { status: 400 });
  const view = parseView(b.view);
  const id = await exportCreate({ createdBy: who, title: titleFor(ds, viewFromParams(view)), kind: ds, format, params: { view } });
  after(() => runExport(id, ds, format, view));
  return json({ id }, { status: 202 });
});
