import { hasDatabase, json, rpc, userFrom } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";
import { isUuid, isVisitor } from "../../../../lib/server/ids";
import { FREE } from "../../../../lib/wall/model";

/**
 * "Keep it 72 more hours" (founder's ask, 2026-10-03): the maker's live spot
 * stays on the wall, same number, in its last 24 hours (maker_extend). For
 * the browser that placed it or the signed-in account. Free spots only:
 * while payments are on, renewing goes through Stripe (not built yet).
 */
export const POST = measured("/api/mine/extend", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "Spots aren't open yet." }, { status: 503 });
  if (!FREE) return json({ error: "Keeping a spot on isn't open yet." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { visitor?: string; id?: string };
  if (!b.visitor || !isVisitor(b.visitor) || !b.id || !isUuid(b.id)) return json({ error: "bad request" }, { status: 400 });
  const user = await userFrom(req);
  try {
    const endsAt = await rpc<string>("maker_extend", { p_story: b.id, p_visitor: b.visitor, ...(user && { p_user: user }) });
    return json({ endsAt });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const [status, error] = m.includes("too_early")
      ? [409, "You can keep it on in its last 24 hours."]
      : m.includes("not_live")
        ? [409, "This spot isn't on the wall any more."]
        : m.includes("not_yours")
          ? [403, "Only its maker can keep this spot on."]
          : [502, "Something went wrong. Try again."];
    return json({ error }, { status });
  }
});
