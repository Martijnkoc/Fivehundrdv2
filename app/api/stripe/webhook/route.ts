import type Stripe from "stripe";
import { env, hasDatabase, hasPayments, json, rpc, stripe } from "../../../../lib/server/backend";
import { refundStory } from "../../../../lib/server/refunds";

/**
 * Stripe tells us how each checkout ended. Paid → the spot goes live for 72
 * hours; expired or failed → the number is free again. Every call is
 * idempotent, so Stripe's retries are harmless.
 */
export async function POST(req: Request) {
  if (!hasDatabase() || !hasPayments()) return json({ error: "offline" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await req.text(), sig, env.stripeWebhookSecret);
  } catch {
    return json({ error: "signature" }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const story = session.metadata?.story_id;
  if (!story) return json({ ok: true, ignored: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
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
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await rpc("checkout_release", { p_story: story });
        break;
    }
  } catch {
    // Stripe retries on anything but 2xx
    return json({ error: "database" }, { status: 500 });
  }
  return json({ ok: true });
}
