import { hasDatabase, json, rpc, userFrom } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";
import { isUuid, isVisitor } from "../../../../lib/server/ids";
import { moderate } from "../../../../lib/server/moderation";
import { forgetWall } from "../../../../lib/server/story";
import { checkWords } from "../../../../lib/wall/claimRules";
import { LANE, type LaneId } from "../../../../lib/wall/model";

/**
 * Fix it in the first hour (founder's ask, 2026-10-05): the maker changes
 * the words and links of their live spot, not its files, lane or number
 * (maker_edit). The same checks as placing it, the automatic one included.
 * For the browser that placed it or the signed-in account.
 */
export const POST = measured("/api/mine/edit", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "Spots aren't open yet." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { visitor?: string; id?: string; lane?: string };
  if (!b.visitor || !isVisitor(b.visitor) || !b.id || !isUuid(b.id) || !b.lane || !(b.lane in LANE))
    return json({ error: "bad request" }, { status: 400 });
  const lane = b.lane as LaneId;
  const words = checkWords(b, lane);
  if ("error" in words) return json(words, { status: 400 });
  const moderation = await moderate({ ...words, lane, artwork: null, logo: null, gallery: [] });
  if (moderation.verdict === "block") return json({ error: `This can't go on the wall as it is. ${moderation.reason}` }, { status: 422 });
  const user = await userFrom(req);
  try {
    const left = await rpc<number>("maker_edit", {
      p_story: b.id,
      p_visitor: b.visitor,
      p_user: user,
      p_patch: { ...words, moderation },
    });
    forgetWall();
    return json({ left });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const [status, error] = m.includes("too_late")
      ? [409, "Changes are only possible in the first hour."]
      : m.includes("too_many")
        ? [409, "That's the last change this spot can take."]
        : m.includes("not_live")
          ? [409, "This spot isn't on the wall any more."]
          : m.includes("not_yours")
            ? [403, "Only its maker can change this spot."]
            : [502, "Something went wrong. Try again."];
    return json({ error }, { status });
  }
});
