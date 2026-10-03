import { hasDatabase, json, rpc, userFrom } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";
import type { MakerNumbers } from "../../../lib/site/reminderEmail";
import { isUuid, isVisitor } from "../../../lib/server/ids";

/**
 * "Your story" on the maker's card: their own spots' numbers (maker_stats),
 * for the browser that placed them, and for the signed-in account on any
 * device (Authorization: Bearer <access token>).
 */
export const POST = measured("/api/mine", async (req: Request) => {
  if (!hasDatabase()) return json([]);
  const b = (await req.json().catch(() => ({}))) as { visitor?: string; ids?: unknown[] };
  if (!b.visitor || !isVisitor(b.visitor) || !Array.isArray(b.ids)) return json({ error: "bad request" }, { status: 400 });
  const ids = [...new Set(b.ids.filter((s): s is string => typeof s === "string" && isUuid(s)))].slice(0, 20);
  const user = await userFrom(req);
  if (!ids.length && !user) return json([]);
  try {
    const rows = await rpc<(MakerNumbers & { id: string; endsAt: string })[]>("maker_stats", {
      p_visitor: b.visitor,
      p_stories: ids,
      ...(user && { p_user: user }),
    });
    return json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
