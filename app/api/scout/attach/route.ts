import { hasDatabase, json, rpc, userFrom } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Scout (docs/scout.md): after signing in, this browser's history joins the
 * account (scout_attach). `story`: the Timeheart that led to signing in,
 * which the database lets count only within 30 minutes on a live story.
 */
export const POST = measured("/api/scout/attach", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  const user = await userFrom(req);
  if (!user) return json({ error: "not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { visitor?: string; story?: string };
  if (!b.visitor || !VISITOR.test(b.visitor)) return json({ error: "bad request" }, { status: 400 });
  try {
    return json(await rpc("scout_attach", { p_user: user, p_visitor: b.visitor, p_story: b.story && UUID.test(b.story) ? b.story : null }));
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
