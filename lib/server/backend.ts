import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/*
 * Server-side access to Supabase and Stripe. The database only accepts
 * changes from calls that carry FIVEHUNDRD_SERVER_KEY (kept in Supabase
 * Vault); the publishable key alone can read the public wall and nothing more.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  serverKey: process.env.FIVEHUNDRD_SERVER_KEY ?? "",
  stripeSecret: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  /** Supabase secret key: Storage uploads and clean-up only */
  supabaseSecret: process.env.SUPABASE_SECRET_KEY ?? "",
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? "",
  /** who may open /admin, comma separated */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  cronSecret: process.env.CRON_SECRET ?? "",
};

export const hasDatabase = () => !!(env.supabaseUrl && env.publishableKey && env.serverKey);
export const hasPayments = () => !!(env.stripeSecret && env.stripeWebhookSecret);

let db: SupabaseClient | null = null;
export function database() {
  db ??= createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return db;
}

/** Calls one of the wall's database functions; server functions get the server key. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, server = true): Promise<T> {
  const { data, error } = await database().rpc(fn, server ? { p_key: env.serverKey, ...args } : args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}

let storageClient: SupabaseClient | null = null;
/** Storage with the secret key: signed upload links and removing files. */
export function storage() {
  storageClient ??= createClient(env.supabaseUrl, env.supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } });
  return storageClient.storage;
}

let stripeClient: Stripe | null = null;
export function stripe() {
  stripeClient ??= new Stripe(env.stripeSecret);
  return stripeClient;
}

/** A salted hash of the visitor's IP, for abuse limits without storing the address. */
export function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(env.serverKey + ":" + ip).digest("hex").slice(0, 32);
}

export const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });

/** Cloudflare Turnstile: true when the visitor passed (or Turnstile isn't set up). */
export async function humanCheck(token: unknown, req: Request): Promise<boolean> {
  if (!env.turnstileSecret) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.turnstileSecret,
        response: token,
        remoteip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined,
      }),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** The signed-in admin's email, or null. The browser sends its Supabase access token. */
export async function adminFrom(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !env.adminEmails.length) return null;
  const { data, error } = await database().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email || !data.user?.email_confirmed_at) return null;
  return env.adminEmails.includes(email) ? email : null;
}
