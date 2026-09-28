import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The Control Room's session cookie: the address and an expiry, signed with
 * HMAC-SHA256. Pure, so it's tested (session.test.mjs); lib/founder/auth.ts
 * supplies the secret and the allowed addresses.
 */

export const COOKIE = "fh_founder";
export const SESSION_DAYS = 14;

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function sessionValue(email: string, secret: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ e: email, x: now + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The address in a valid, unexpired cookie that is still on the list, or null. */
export function readSession(value: string | undefined, secret: string, allowed: string[], now = Date.now()): string | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(body, "base64url").toString()) as { e: string; x: number };
    /* a removed address loses access straight away */
    return typeof e === "string" && x > now && allowed.includes(e) ? e : null;
  } catch {
    return null;
  }
}
