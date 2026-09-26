import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database, env } from "../server/backend";
import { isDemo } from "./data";
import { COOKIE, readSession as read, SESSION_DAYS, sessionValue as value } from "./session";

/*
 * Who may open the Control Room: the addresses in FOUNDER_EMAILS (or, if that
 * isn't set, ADMIN_EMAILS). They sign in with a Supabase email link; the
 * server checks the address and sets its own signed, httpOnly session cookie
 * for /founder and /api/founder. Nothing the browser holds can read data
 * without it, and the cookie never reaches the public site's code.
 */

export { COOKIE } from "./session";

export const allowed = () =>
  (process.env.FOUNDER_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** The signing key: its own secret if set, otherwise derived from the server key (never used as is). */
const secret = () =>
  process.env.FOUNDER_SESSION_SECRET || (env.serverKey ? createHmac("sha256", env.serverKey).update("founder-session").digest("hex") : "");

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};

/** The signed-in founder, or null. The demo has one made-up founder. */
export async function founder(): Promise<string | null> {
  if (isDemo()) return "demo@fivehundrd.com";
  return readSession((await cookies()).get(COOKIE)?.value);
}

/** For pages: the founder, or off to the sign-in screen. */
export async function requireFounder(): Promise<string> {
  const f = await founder();
  if (!f) redirect("/founder/login");
  return f;
}

/** For API routes: the founder, or null (answer 401). Also refuses cross-site writes. */
export async function founderFrom(req: Request): Promise<string | null> {
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(req.url).host) return null;
  }
  return founder();
}

/** Checks a Supabase access token from the email link and returns the address if it may enter. */
export async function emailFromToken(token: string): Promise<string | null> {
  if (!token || !allowed().length) return null;
  const { data, error } = await database().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email || !data.user?.email_confirmed_at) return null;
  return allowed().includes(email) ? email : null;
}

/** A signed session value for an address (FOUNDER_SESSION_SECRET, or derived from the server key). */
export const sessionValue = (email: string) => value(email, secret());
function readSession(v: string | undefined) {
  /* no key, no sessions (a guessable key would make cookies forgeable) */
  const k = secret();
  return k ? read(v, k, allowed()) : null;
}
