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
