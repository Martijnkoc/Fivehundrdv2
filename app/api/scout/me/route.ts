import { hasDatabase, json, rpc, userFrom } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

/** Scout (docs/scout.md): the signed-in Scout's own card and calls (scout_me); never the raw score. */
export const GET = measured("/api/scout/me", async (req: Request) => {
  if (!hasDatabase()) return json(null);
  const user = await userFrom(req);
  if (!user) return json({ error: "not signed in" }, { status: 401 });
  try {
    return json(await rpc("scout_me", { p_user: user }));
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
