import { hasDatabase, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";

/**
 * Today on Fivehundrd (docs/copy.md): distinct visitors and discoveries
 * opened so far today (UTC), real counts from the database, cached for 30
 * seconds. Without a database there are no numbers, and it says so.
 */
export const GET = measured("/api/today", async () => {
  const cache = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };
  if (!hasDatabase()) return Response.json({ available: false }, { headers: cache });
  try {
    const t = await rpc<{ day: string; visitors: number; opened: number }>("today_public", {}, false);
    return Response.json({ available: true, ...t }, { headers: cache });
  } catch {
    return Response.json({ available: false }, { headers: { "Cache-Control": "no-store" } });
  }
});
