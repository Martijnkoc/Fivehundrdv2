import type Stripe from "stripe";
import { env, hasDatabase, hasPayments, json, rpc, stripe } from "../../../../lib/server/backend";
import { measured, opsLog } from "../../../../lib/server/ops";
import { refundStory } from "../../../../lib/server/refunds";

/** Stripe's fee for a payment, from its balance transaction (in the charge's currency, cents). */
async function feeOf(pi: string): Promise<number | null> {
  try {
    const p = await stripe().paymentIntents.retrieve(pi, { expand: ["latest_charge.balance_transaction"] });
    const bt = (p.latest_charge as Stripe.Charge | null)?.balance_transaction;
    return bt && typeof bt === "object" ? bt.fee : null;
  } catch {
    return null;
  }
}

/**
 * Stripe tells us how each checkout ended. Paid → the spot goes live for 72
 * hours; expired or failed → the number is free again. Chargebacks are
 * recorded against their story for the Control Room's revenue page. Every
 * call is idempotent, so Stripe's retries are harmless.
 */
export const POST = measured("/api/stripe/webhook", async (req: Request) => {
  if (!hasDatabase() || !hasPayments()) return json({ error: "offline" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await req.text(), sig, env.stripeWebhookSecret);
  } catch {
    opsLog("webhook", false, { route: "/api/stripe/webhook", status: 400, message: "bad signature" });
    return json({ error: "signature" }, { status: 400 });
  }
  const t0 = performance.now();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const story = session.metadata?.story_id;
        if (!story) break;
        if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") break;
        const pi = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
        await rpc("checkout_complete", {
          p_story: story,
          p_payment_intent: pi,
          p_amount: session.amount_total,
          p_currency: session.currency,
        });
        /* no spot, no charge: paid for a spot that was taken off the wall or let go in the meantime */
        const st = await rpc<{ status: string; startsAt: string | null; refunded: boolean } | null>("checkout_status", { p_story: story });
        if (pi && st && !st.startsAt && !st.refunded) await refundStory(story, pi, "requested_by_customer");
        /* the fee, so net revenue reconciles with Stripe */
        if (pi) {
          const fee = await feeOf(pi);
          if (fee != null) await rpc("record_fee", { p_story: story, p_fee: fee });
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const story = (event.data.object as Stripe.Checkout.Session).metadata?.story_id;
        if (story) await rpc("checkout_release", { p_story: story });
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const d = event.data.object as Stripe.Dispute;
        const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
        /* a won dispute costs nothing; otherwise the disputed amount is lost (plus Stripe's dispute fee, in the fee report) */
        if (pi) await rpc("record_dispute", { p_payment_intent: pi, p_amount: d.status === "won" ? 0 : d.amount, p_status: d.status });
        break;
      }
    }
  } catch (e) {
    opsLog("webhook", false, {
      route: "/api/stripe/webhook",
      status: 500,
      ms: Math.round(performance.now() - t0),
      message: `${event.type}: ${e instanceof Error ? e.message : String(e)}`,
      meta: { event: event.id, type: event.type },
    });
    // Stripe retries on anything but 2xx
    return json({ error: "database" }, { status: 500 });
  }
  opsLog("webhook", true, {
    route: "/api/stripe/webhook",
    status: 200,
    ms: Math.round(performance.now() - t0),
    message: event.type,
    meta: { event: event.id, type: event.type },
  });
  return json({ ok: true });
});
