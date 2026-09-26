import { hasDatabase, json, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";

/** Every live story and every held number (BUILD_BRIEF §15). Cached briefly at the edge. */
export const GET = measured("/api/wall", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  try {
    const feed = await rpc("wall_public", {}, false);
    return Response.json(feed, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" } });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
