import { env, hasDatabase, ipHash, json, rpc } from "../../../lib/server/backend";
import { isUuid, isVisitor } from "../../../lib/server/ids";
import { measured } from "../../../lib/server/ops";
import { hasReminders, reminderConfig } from "../../../lib/server/reminders";
import type { Feed } from "../../../lib/wall/live";
import { LANE, pad, type LaneId } from "../../../lib/wall/model";

/**
 * A visitor reports a story (approved change, 2026-10-01): from the footer,
 * by lane and spot number. Three reports take it off the wall until someone
 * looks; every report is mailed to the people who look after the wall.
 */
export const POST = measured("/api/reports", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { lane?: string; no?: unknown; visitor?: string };
  const no = Number(b.no);
  if (!b.lane || !(b.lane in LANE) || !Number.isInteger(no) || no < 1 || no > 500) return json({ error: "bad request" }, { status: 400 });
  const lane = b.lane as LaneId;
  try {
    const feed = await rpc<Feed>("wall_public", {}, false);
    const story = feed.stories.find((s) => s.lane === lane && s.no === no);
    if (!story || !isUuid(story.id)) return json({ ok: false, error: "not found" }, { status: 404 });
    const r = await rpc<{ ok: boolean; hidden: boolean }>("report_story", {
      p_story: story.id,
      p_reason: "other",
      p_note: "",
      p_email: "",
      p_visitor: isVisitor(b.visitor) ? b.visitor : "",
      p_ip_hash: ipHash(req),
    });
    if (r.ok) await tellTeam(`${LANE[lane]} No. ${pad(no)}`, story.name, r.hidden).catch(() => {});
    return json(r);
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});

/** One email per report to ADMIN_EMAILS, through the reminders' provider; without it, /admin still lists every report. */
async function tellTeam(spot: string, name: string, hidden: boolean) {
  if (!hasReminders() || !env.adminEmails.length) return;
  const { key, from } = reminderConfig();
  const text = `${spot}, "${name}", was reported on Fivehundrd.${hidden ? " It has been taken off the wall until someone looks at it." : ""}\n\nSee it in /admin.`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: env.adminEmails, subject: `Report: ${spot}, ${name}`, text }),
  });
}
