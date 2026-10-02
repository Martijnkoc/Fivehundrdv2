import { hasDatabase, json, rpc, userFrom } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";
import { isUuid, isVisitor } from "../../../../lib/server/ids";
import type { EndedStory } from "../../../../lib/wall/again";

/**
 * "Your story" after its 72 hours (maker_ended): the maker's stories that
 * ended in the last 30 days, with their final numbers and what Create needs
 * to put them on again. For the browser that paid, or for the signed-in
 * account with the checkout email (Authorization: Bearer <access token>).
 */
export const POST = measured("/api/mine/ended", async (req: Request) => {
  if (!hasDatabase()) return json([]);
  const b = (await req.json().catch(() => ({}))) as { visitor?: string; ids?: unknown[] };
  if (!b.visitor || !isVisitor(b.visitor) || !Array.isArray(b.ids)) return json({ error: "bad request" }, { status: 400 });
  const ids = [...new Set(b.ids.filter((s): s is string => typeof s === "string" && isUuid(s)))].slice(0, 20);
  const user = await userFrom(req);
  if (!ids.length && !user) return json([]);
  try {
    const rows = await rpc<EndedStory[]>("maker_ended", { p_visitor: b.visitor, p_stories: ids, ...(user && { p_user: user }) });
    return json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
