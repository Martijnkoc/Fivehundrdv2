import { hasDatabase, rpc } from "../../../../lib/server/backend";
import { offTokenOk } from "../../../../lib/server/reminders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const page = (msg: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Reminders</title><body style="margin:0;padding:40px 20px;background:#f7f3ea;font-family:Inter,Arial,sans-serif;color:#0d0d0d"><div style="max-width:480px;margin:0 auto"><p style="font:800 22px Georgia,serif">Fivehundrd.</p><p style="font-size:16px;line-height:1.5">${msg}</p><p><a href="/" style="color:#0d0d0d">Back to The Wall</a></p></div></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } },
  );

/** The link in every reminder email: turns that person's reminders off. (POST: one-click unsubscribe from mail apps.) */
async function off(req: Request) {
  const q = new URL(req.url).searchParams;
  const u = q.get("u") ?? "",
    t = q.get("t") ?? "";
  if (!UUID.test(u) || !t || !offTokenOk(u, t)) return page("That link doesn't work. Open it from the email again.", 400);
  if (!hasDatabase()) return page("Something went wrong. Try again in a minute.", 503);
  try {
    await rpc("remind_off", { p_user: u });
  } catch {
    return page("Something went wrong. Try again in a minute.", 502);
  }
  return page("Reminders are off. Your Finds stay where they are.");
}
export const GET = off;
export const POST = off;
