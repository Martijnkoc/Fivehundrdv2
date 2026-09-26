import { hasDatabase, json, rpc } from "../../../lib/server/backend";

/** Every live story and every held number (BUILD_BRIEF §15). Cached briefly at the edge. */
export async function GET() {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  try {
    const feed = await rpc("wall_public", {}, false);
    return Response.json(feed, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" } });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
}
