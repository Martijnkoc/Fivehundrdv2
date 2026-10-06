import { hasDatabase, json, rpc } from "../../../lib/server/backend";
import { isUuid } from "../../../lib/server/ids";
import { measured } from "../../../lib/server/ops";
import { wallFeed } from "../../../lib/server/story";

/** Every live story and every held number (BUILD_BRIEF §15). Cached briefly at the edge. */
export const GET = measured("/api/wall", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  try {
    /* the wall, and what has traction right now (hot_public(), refreshed every 10 minutes) */
    /* ?story=<id>: the maker back from placing a spot, who must find it on the wall (not cached) */
    const story = new URL(req.url).searchParams.get("story");
    const wanted = !!story && isUuid(story);
    const hotRead = rpc("hot_public", {}, false).catch(() => []);
    let feed = await wallFeed();
    if (wanted && !feed.stories.some((s) => s.id === story)) feed = await wallFeed(true);
    const hot = await hotRead;
    return Response.json(
      { ...feed, hot },
      {
        headers: wanted
          ? { "Cache-Control": "private, no-store" }
          : /* the edge keeps it briefly; a browser never serves an old one (stale-while-revalidate there showed a reload a wall from before) */
            { "Cache-Control": "public, max-age=0, must-revalidate", "Vercel-CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" },
      },
    );
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
