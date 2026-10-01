import { isBot } from "../../../lib/founder/attribution";
import { hasDatabase, ipHash, json, rpc, userFrom } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";
import { isUuid, isVisitor } from "../../../lib/server/ids";

const KINDS = new Set(["open", "save", "unsave", "link_click", "share", "entry"]);

/** §15: opens, saves, shares, link clicks and entries, counted per story. */
export const POST = measured("/api/events", async (req: Request) => {
  if (!hasDatabase()) return new Response(null, { status: 204 });
  /* crawlers and link previewers don't count (they'd skew the counts and Hotspots) */
  if (isBot(req.headers.get("user-agent"))) return new Response(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as { story?: string; kind?: string; visitor?: string };
  if (!b.story || !isUuid(b.story) || !b.kind || !KINDS.has(b.kind) || !b.visitor || !isVisitor(b.visitor))
    return json({ error: "bad request" }, { status: 400 });
  /* Scout: a signed-in Timeheart is the account's call (only saves carry the account) */
  const user = b.kind === "save" || b.kind === "unsave" ? await userFrom(req) : null;
  try {
    const counted = await rpc<boolean>("record_event", {
      p_story: b.story,
      p_kind: b.kind,
      p_visitor: b.visitor,
      p_ip_hash: ipHash(req),
      /* only when signed in: without it the call matches the database before Scout as well */
      ...(user && { p_user: user }),
    });
    return json({ counted });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
