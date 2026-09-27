import { SITE_URL } from "../../../../lib/site/facts";
import { makerEmail, reminderEmail, type DueStory, type MakerNotice } from "../../../../lib/site/reminderEmail";
import { env, hasDatabase, json, rpc } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";
import { hasReminders, offToken, sendEmail } from "../../../../lib/server/reminders";

type Due = { user: string; email: string; stories: DueStory[] };
type Notice = MakerNotice & { story: string; email: string };

/**
 * Sends what's due: "One of your Finds leaves The Wall in an hour" to
 * visitors, and "your spot is a Hotspot" / "6 hours left" to makers. Called
 * every 10 minutes by the database (pg_cron → private.ping_reminders, with
 * the server key) or by a scheduler with CRON_SECRET. Each story is reminded
 * once per person; nothing is marked sent unless the email went out.
 */
async function run(req: Request) {
  const auth = req.headers.get("authorization");
  const ok = (env.cronSecret && auth === `Bearer ${env.cronSecret}`) || (env.serverKey && auth === `Bearer ${env.serverKey}`);
  if (!ok) return json({ error: "not allowed" }, { status: 401 });
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  if (!hasReminders()) return json({ sent: 0, skipped: "no email provider configured" });
  const due = await rpc<Due[]>("reminders_due");
  let sent = 0;
  for (const d of due.slice(0, 200)) {
    const off = `${SITE_URL}/api/remind/off?u=${d.user}&t=${offToken(d.user)}`;
    try {
      if (await sendEmail(d.email, reminderEmail(d.stories, SITE_URL, off), off)) {
        await rpc("reminders_sent", { p_user: d.user, p_stories: d.stories.map((s) => s.id) });
        sent++;
      }
    } catch {
      /* the next run tries again */
    }
  }
  /* makers: "your spot is a Hotspot", "6 hours left" */
  const notices = await rpc<Notice[]>("maker_notices_due");
  let told = 0;
  for (const n of notices.slice(0, 200)) {
    const off = `${SITE_URL}/api/remind/off?s=${n.story}&t=${offToken(n.story, "maker")}`;
    try {
      if (await sendEmail(n.email, makerEmail(n, SITE_URL, off), off)) {
        await rpc("maker_notice_sent", { p_story: n.story, p_kind: n.kind });
        told++;
      }
    } catch {
      /* the next run tries again */
    }
  }
  return json({ due: due.length, sent, makers: told });
}

export const GET = measured("/api/cron/reminders", run);
export const POST = measured("/api/cron/reminders", run);
