import { founderFrom } from "../../../../../lib/founder/auth";
import { exportGet } from "../../../../../lib/founder/data";
import { download } from "../../../../../lib/founder/exports";
import { json } from "../../../../../lib/server/backend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Downloads a finished export: a one-minute signed link to the private file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await founderFrom(req))) return json({ error: "sign in" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "not found" }, { status: 404 });
  const e = await exportGet(id);
  if (!e || e.status !== "done") return json({ error: "not ready" }, { status: 404 });
  const f = await download(e);
  if (!f) return json({ error: "file missing" }, { status: 410 });
  if ("url" in f) return Response.redirect(f.url, 302);
  const name = `fivehundrd-${e.kind}-${e.created_at.slice(0, 10)}.${e.format}`;
  return new Response(f.body as BodyInit, {
    headers: { "Content-Type": f.type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
