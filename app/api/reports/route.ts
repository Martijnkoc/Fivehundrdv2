import { hasDatabase, ipHash, json, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";

const REASONS = ["sexual", "child", "scam", "hate", "violence", "illegal", "copyright", "spam", "other"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A visitor reports a story. Three reports (or one about a child) take it off the wall until someone looks. */
export const POST = measured("/api/reports", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { story?: string; reason?: string; note?: string; email?: string; visitor?: string };
  if (!b.story || !UUID.test(b.story) || !REASONS.includes(b.reason as (typeof REASONS)[number]))
    return json({ error: "bad request" }, { status: 400 });
  try {
    const r = await rpc<{ ok: boolean; hidden: boolean }>("report_story", {
      p_story: b.story,
      p_reason: b.reason,
      p_note: String(b.note ?? "").slice(0, 500),
      p_email: String(b.email ?? "").slice(0, 200),
      p_visitor: String(b.visitor ?? "").slice(0, 64),
      p_ip_hash: ipHash(req),
    });
    return json(r);
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
