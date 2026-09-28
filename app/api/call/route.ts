import { isBot } from "../../../lib/founder/attribution";
import { hasDatabase, ipHash, json, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";
import type { CallResult } from "../../../lib/wall/retention";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;


/** Call it: a visitor's private prediction that a story will move (docs/retention.md). */
export const POST = measured("/api/call", async (req: Request) => {
  if (!hasDatabase()) return json({ status: "unavailable" } satisfies CallResult);
  if (isBot(req.headers.get("user-agent"))) return json({ status: "unavailable" } satisfies CallResult);
  const b = (await req.json().catch(() => ({}))) as { story?: string; visitor?: string };
  if (!b.story || !UUID.test(b.story) || !b.visitor || !VISITOR.test(b.visitor)) return json({ error: "bad request" }, { status: 400 });
  try {
    return json(await rpc<CallResult>("call_story", { p_visitor: b.visitor, p_story: b.story, p_ip_hash: ipHash(req) }));
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
