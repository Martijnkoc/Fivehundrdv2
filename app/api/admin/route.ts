import { adminFrom, hasDatabase, hasPayments, json, rpc, stripe } from "../../../lib/server/backend";
import { refundStory } from "../../../lib/server/refunds";
import { measured } from "../../../lib/server/ops";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILTERS = new Set(["attention", "live", "removed", "all"]);

/*
 * The admin screen's server. Only signed-in addresses listed in ADMIN_EMAILS
 * get in; the database itself only listens to the server key.
 */

/** GET ?view=overview | stories (&filter, &q, &offset) | reports (&id) */
export const GET = measured("/api/admin", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  if (!(await adminFrom(req))) return json({ error: "not allowed" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  try {
    switch (q.get("view")) {
      case "overview":
        return json(await rpc("admin_overview"));
      case "stories": {
        const filter = q.get("filter") ?? "attention";
        return json(
          await rpc("admin_stories", {
            p_filter: FILTERS.has(filter) ? filter : "attention",
            p_query: (q.get("q") ?? "").slice(0, 100),
            p_limit: 50,
            p_offset: Math.max(0, Number(q.get("offset")) || 0),
          }),
        );
      }
      case "reports": {
        const id = q.get("id") ?? "";
        if (!UUID.test(id)) return json({ error: "id" }, { status: 400 });
        return json(await rpc("admin_reports", { p_story: id }));
      }
    }
    return json({ error: "view" }, { status: 400 });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});

type Removed = { session: string | null; paymentIntent: string | null; amount: number | null; refunded: boolean };

/** POST { action: hide | unhide | approve | remove | refund, id, reason?, refund? } */
export const POST = measured("/api/admin", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  const admin = await adminFrom(req);
  if (!admin) return json({ error: "not allowed" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; reason?: string; refund?: boolean };
  if (!b.id || !UUID.test(b.id)) return json({ error: "id" }, { status: 400 });
  const reason = String(b.reason ?? "").slice(0, 200) || null;
  try {
    switch (b.action) {
      case "hide":
        return json({ ok: await rpc("admin_hide", { p_story: b.id, p_hidden: true, p_reason: reason ?? `hidden by ${admin}` }) });
      case "unhide":
        return json({ ok: await rpc("admin_hide", { p_story: b.id, p_hidden: false }) });
      case "approve":
        return json({ ok: await rpc("admin_approve", { p_story: b.id }) });
      case "remove": {
        const r = await rpc<Removed | null>("admin_remove", { p_story: b.id, p_reason: reason ?? "removed" });
        if (!r) return json({ error: "not found" }, { status: 404 });
        let refunded = 0;
        if (hasPayments()) {
          /* not paid yet: end the checkout so it can't be paid */
          if (r.session && !r.paymentIntent) {
            const s = await stripe().checkout.sessions.retrieve(r.session);
            if (s.status === "open") await stripe().checkout.sessions.expire(r.session);
          }
          if (b.refund && r.paymentIntent && !r.refunded) refunded = await refundStory(b.id, r.paymentIntent, "requested_by_customer");
        }
        return json({ ok: true, refunded });
      }
      case "refund": {
        const r = await rpc<{ paymentIntent: string | null; refunded: boolean } | null>("checkout_status", { p_story: b.id });
        if (!r?.paymentIntent) return json({ error: "Nothing was paid for this story." }, { status: 400 });
        if (r.refunded) return json({ error: "Already refunded." }, { status: 400 });
        if (!hasPayments()) return json({ error: "Stripe isn't set up." }, { status: 503 });
        return json({ ok: true, refunded: await refundStory(b.id, r.paymentIntent, "requested_by_customer") });
      }
    }
    return json({ error: "action" }, { status: 400 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
});
