import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./backend";

/** Reminders are on when the site has an email provider (Resend) and a sender address. */
export const reminderConfig = () => ({ key: process.env.RESEND_API_KEY ?? "", from: process.env.REMINDER_FROM ?? "" });
export const hasReminders = () => !!(reminderConfig().key && reminderConfig().from && env.serverKey);

/**
 * Off links' signatures: only the person an email went to can stop it.
 * "remind" signs a user id (reminders), "maker" a story id (maker notices).
 */
const sig = (id: string, kind: "remind" | "maker" = "remind") => createHmac("sha256", env.serverKey).update(`${kind}-off:` + id).digest("base64url");
export const offToken = sig;
export function offTokenOk(id: string, token: string, kind: "remind" | "maker" = "remind") {
  const a = Buffer.from(sig(id, kind)),
    b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sendEmail(to: string, m: { subject: string; html: string; text: string }, offUrl: string) {
  const { key, from } = reminderConfig();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: { "List-Unsubscribe": `<${offUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  return r.ok;
}
