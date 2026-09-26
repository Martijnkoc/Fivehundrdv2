import { hasDatabase, ipHash, json, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";

const KINDS = new Set(["open", "save", "unsave", "link_click", "share", "entry"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;

/** §15: opens, saves, shares, link clicks and entries, counted per story. */
export const POST = measured("/api/events", async (req: Request) => {
  if (!hasDatabase()) return new Response(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as { story?: string; kind?: string; visitor?: string };
  if (!b.story || !UUID.test(b.story) || !b.kind || !KINDS.has(b.kind) || !b.visitor || !VISITOR.test(b.visitor))
    return json({ error: "bad request" }, { status: 400 });
  try {
    const counted = await rpc<boolean>("record_event", {
      p_story: b.story,
      p_kind: b.kind,
      p_visitor: b.visitor,
      p_ip_hash: ipHash(req),
    });
    return json({ counted });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
