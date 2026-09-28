import "server-only";
import { rpc, stripe } from "./backend";

/** Refunds a story's payment in full at Stripe and records it. Returns the amount refunded (cents). */
export async function refundStory(story: string, paymentIntent: string, reason: "requested_by_customer" | "fraudulent" | "duplicate") {
  const r = await stripe().refunds.create(
    { payment_intent: paymentIntent, reason, metadata: { story_id: story } },
    // one refund per story, however often this runs
    { idempotencyKey: `refund-${story}` },
  );
  await rpc("record_refund", { p_story: story, p_amount: r.amount });
  return r.amount;
}
