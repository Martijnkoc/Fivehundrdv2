import { hasDatabase, json, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";
import type { FindStatus } from "../../../lib/wall/retention";
import { isUuid, isVisitor } from "../../../lib/server/ids";

/** A visitor's Finds with their history (lib/wall/retention.ts): only stories this visitor saved or called. */
export const POST = measured("/api/finds", async (req: Request) => {
  if (!hasDatabase()) return json([]);
  const b = (await req.json().catch(() => ({}))) as { visitor?: string; ids?: unknown[] };
  if (!b.visitor || !isVisitor(b.visitor) || !Array.isArray(b.ids)) return json({ error: "bad request" }, { status: 400 });
  const ids = [...new Set(b.ids.filter((s): s is string => typeof s === "string" && isUuid(s)))].slice(0, 200);
  if (!ids.length) return json([]);
  try {
    return json(await rpc<FindStatus[]>("finds_status", { p_visitor: b.visitor, p_stories: ids }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
