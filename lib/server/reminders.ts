import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./backend";

/** Reminders are on when the site has an email provider (Resend) and a sender address. */
export const reminderConfig = () => ({ key: process.env.RESEND_API_KEY ?? "", from: process.env.REMINDER_FROM ?? "" });
export const hasReminders = () => !!(reminderConfig().key && reminderConfig().from && env.serverKey);

/** The off link's signature: only the person the email went to can turn their reminders off. */
const sig = (user: string) => createHmac("sha256", env.serverKey).update("remind-off:" + user).digest("base64url");
export const offToken = sig;
export function offTokenOk(user: string, token: string) {
  const a = Buffer.from(sig(user)),
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
