import { cookies } from "next/headers";
import { COOKIE, cookieOptions, emailFromToken, sessionValue } from "../../../../lib/founder/auth";
import { json } from "../../../../lib/server/backend";
import { measured, opsLog } from "../../../../lib/server/ops";

/** Signs a founder in: the Supabase token from the email link, checked against FOUNDER_EMAILS. */
export const POST = measured("/api/founder/session", async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "origin" }, { status: 403 });
  const { token } = ((await req.json().catch(() => ({}))) ?? {}) as { token?: string };
  if (!process.env.FOUNDER_SESSION_SECRET && !process.env.FIVEHUNDRD_SERVER_KEY) return json({ error: "not configured" }, { status: 503 });
  const email = await emailFromToken(typeof token === "string" ? token : "");
  if (!email) {
    opsLog("error", false, { route: "/api/founder/session", status: 403, message: "Control Room sign-in refused" });
    return json({ error: "not allowed" }, { status: 403 });
  }
  (await cookies()).set(COOKIE, sessionValue(email), cookieOptions);
  return json({ ok: true });
});

export const DELETE = measured("/api/founder/session", async () => {
  (await cookies()).delete(COOKIE);
  return json({ ok: true });
});
